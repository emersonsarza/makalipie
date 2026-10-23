import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAllowedMutationOrigin } from "../admin/access";
import { requireOwner } from "../admin/session";
import { parseBranchSettings } from "../branches/schema";
import { variantSchema } from "../catalog/schema";
import { getServerFirebase } from "../firebase/server";
import { ProductError, decodeProduct } from "../products/store";
import {
  PACKAGE_POLICY_VERSION,
  PackageCommandError,
  defaultPackageSettings,
  packageSettingsSchema,
  packagesAccess,
  packagesRevision,
  planPackageSave,
  presentPackages,
  variantBranchIds,
  type PackageCommand,
  type PackageDependencies,
  type PackageSettings,
  type PackageVariantView,
} from "./packages-v2";

const commands = "adminPackageCommands";
const LOAD_ERROR = "Packages couldn't be loaded. Please try again.";

export async function readAdminPackages() {
  const owner = await requireOwner();
  const [stored, deps] = await Promise.all([loadPackages(), loadDependencies()]);
  return presentPackages(stored, deps, packagesAccess(owner).canEdit);
}

export async function commitAdminPackages(request: Request, command: PackageCommand) {
  if (!isAllowedMutationOrigin(request, process.env.ADMIN_APP_ORIGIN ?? "")) throw new ProductError(403, "This save could not be verified. Refresh the page and try again.");
  const owner = await requireOwner();
  const access = packagesAccess(owner);
  const db = getServerFirebase().db;
  const [stored, deps] = await Promise.all([loadPackages(), loadDependencies()]);
  planPackageSave({ command, stored, deps, access });
  const claim = await claimCommand(db, command, owner.uid, access.canEdit);
  if (claim === "replay") return finish(access.canEdit);
  let completed = false;
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc("settings/packages");
      const existing = await tx.get(ref);
      const current = existing.exists ? parsePackages(existing.data()) : defaultPackageSettings();
      const dependencies = await dependenciesIn(tx, db);
      const next = planPackageSave({ command, stored: current, deps: dependencies, access });
      const saved = { ...next, version: next.version + 1 };
      tx.set(ref, { ...saved, updatedAt: FieldValue.serverTimestamp(), updatedBy: owner.uid });
      tx.create(db.collection("packageSettingsEvents").doc(), {
        actorUid: owner.uid,
        at: FieldValue.serverTimestamp(),
        packageId: command.package.id,
        policy: PACKAGE_POLICY_VERSION,
        before: existing.exists ? existing.data() : null,
        after: saved,
      });
    });
    completed = true;
    await db.collection(commands).doc(command.idempotencyKey).set({ completed: true }, { merge: true });
    return finish(access.canEdit);
  } catch (error) {
    if (!completed) await db.collection(commands).doc(command.idempotencyKey).delete().catch(() => undefined);
    throw error;
  }
}

async function finish(canEdit: boolean) {
  const [stored, deps] = await Promise.all([loadPackages(), loadDependencies()]);
  return { ok: true as const, snapshot: presentPackages(stored, deps, canEdit) };
}

async function loadPackages(): Promise<PackageSettings> {
  const snap = await getServerFirebase().db.doc("settings/packages").get();
  if (!snap.exists) return defaultPackageSettings();
  return parsePackages(snap.data());
}

function parsePackages(data: FirebaseFirestore.DocumentData | undefined): PackageSettings {
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data ?? {};
    void _at; void _by;
    return packageSettingsSchema.parse(rest);
  } catch {
    throw new PackageCommandError(503, "network", LOAD_ERROR);
  }
}

async function loadDependencies(): Promise<PackageDependencies> {
  const db = getServerFirebase().db;
  const [branchSnap, products] = await Promise.all([
    db.doc("settings/branches").get().catch(() => { throw new PackageCommandError(503, "network", LOAD_ERROR); }),
    db.collection("products").get().catch(() => { throw new PackageCommandError(503, "network", LOAD_ERROR); }),
  ]);
  const variants = await Promise.all(products.docs.map((doc) => doc.ref.collection("variants").get().catch(() => { throw new PackageCommandError(503, "network", LOAD_ERROR); })));
  return dependenciesFrom(branchSnap.exists ? branchSnap.data() : undefined, products.docs, variants);
}

async function dependenciesIn(tx: FirebaseFirestore.Transaction, db: Firestore): Promise<PackageDependencies> {
  const branchSnap = await tx.get(db.doc("settings/branches"));
  const products = await tx.get(db.collection("products"));
  const variants = [];
  for (const doc of products.docs) variants.push(await tx.get(doc.ref.collection("variants")));
  return dependenciesFrom(branchSnap.exists ? branchSnap.data() : undefined, products.docs, variants);
}

function dependenciesFrom(branchData: FirebaseFirestore.DocumentData | undefined, products: FirebaseFirestore.QueryDocumentSnapshot[], variants: FirebaseFirestore.QuerySnapshot[]): PackageDependencies {
  const settings = branchData ? parseBranches(branchData) : null;
  const known = new Set(settings?.branches.map((branch) => branch.id) ?? []);
  const rows: PackageVariantView[] = [];
  products.forEach((doc, index) => {
    let product;
    try { product = decodeProduct(doc); }
    catch { throw new PackageCommandError(503, "network", LOAD_ERROR); }
    for (const variantDoc of variants[index].docs) {
      const parsed = variantSchema.safeParse({ ...variantDoc.data(), id: variantDoc.id });
      if (!parsed.success) throw new PackageCommandError(503, "network", LOAD_ERROR);
      rows.push({
        key: `${product.id}:${parsed.data.id}`,
        productId: product.id,
        variantId: parsed.data.id,
        name: product.name,
        size: parsed.data.label,
        active: product.active && parsed.data.active,
        branchIds: variantBranchIds(product.id, parsed.data.id, settings?.assignments ?? [], known),
        category: product.category,
        priceCentavos: parsed.data.priceCentavos,
        minLeadDays: parsed.data.minLeadDays,
      });
    }
  });
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size) || a.key.localeCompare(b.key));
  return {
    variants: rows,
    branches: (settings?.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name })),
    branchVersion: settings?.version ?? 0,
  };
}

function parseBranches(data: FirebaseFirestore.DocumentData) {
  try {
    const { updatedAt: _at, updatedBy: _by, ...rest } = data;
    void _at; void _by;
    return parseBranchSettings(rest);
  } catch {
    throw new PackageCommandError(503, "network", LOAD_ERROR);
  }
}

async function claimCommand(db: Firestore, command: PackageCommand, uid: string, canEdit: boolean) {
  const ref = db.collection(commands).doc(command.idempotencyKey);
  const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const judge = async (saved: FirebaseFirestore.DocumentData) => {
    if (saved.uid !== uid || saved.hash !== hash) throw new PackageCommandError(409, "conflict", "This save was already used.");
    if (saved.completed === true) return "replay" as const;
    const [stored, deps] = await Promise.all([loadPackages(), loadDependencies()]);
    if (packagesRevision(stored, deps, canEdit) !== command.expectedRevision) {
      await ref.set({ completed: true }, { merge: true });
      return "replay" as const;
    }
    await ref.delete();
    return "open" as const;
  };
  const existing = await ref.get();
  if (existing.exists) {
    const judged = await judge(existing.data() ?? {});
    if (judged === "replay") return judged;
  }
  try {
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  } catch {
    const again = await ref.get();
    if (!again.exists) throw new PackageCommandError(409, "conflict", "This save was already used.");
    const judged = await judge(again.data() ?? {});
    if (judged === "replay") return judged;
    await ref.create({ uid, hash, completed: false, at: new Date().toISOString() });
  }
  return "claimed" as const;
}
