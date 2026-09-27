import type { Catalog } from "@/lib/catalog/schema";
import type { ProductList } from "@/lib/products/schema";

export const adminKeys = {
  all: ["admin"] as const,
  products: () => [...adminKeys.all, "products"] as const,
  product: (id: string) => [...adminKeys.products(), id] as const,
  catalog: () => [...adminKeys.all, "catalog"] as const,
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Request failed.");
  }
  return body as T;
}

export async function fetchAdminProducts(): Promise<ProductList> {
  return readJson(await fetch("/api/admin/products", { cache: "no-store" }));
}

export async function fetchAdminCatalog(): Promise<Catalog> {
  return readJson(await fetch("/api/admin/catalog", { cache: "no-store" }));
}

export async function importAdminProducts(): Promise<ProductList> {
  return readJson(await fetch("/api/admin/products/import", { method: "POST" }));
}

export async function saveAdminCatalog(body: unknown): Promise<Catalog> {
  return readJson(
    await fetch("/api/admin/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
