import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getStorage } from "firebase-admin/storage";
import { adminFailure, adminJson, authorizeMutation, readLimitedBody } from "@/lib/admin/http";
import { getServerFirebase } from "@/lib/firebase/server";
import { ProductError } from "@/lib/products/store";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await authorizeMutation(request);
    const contentType = request.headers.get("content-type");
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType ?? "")) throw new ProductError(415, "Choose a JPG, PNG, or WebP photo.");
    if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) throw new ProductError(503, "Photo uploads are not configured. Add your Firebase Storage bucket to the environment settings.");
    const input = await readLimitedBody(request, 3 * 1024 * 1024);
    let output: Buffer;
    try {
      const source = sharp(input, { limitInputPixels: 25_000_000 });
      const metadata = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      output = await source.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new ProductError(400, "That photo could not be read. Choose a still JPG, PNG, or WebP under 3 MB and 25 megapixels."); }
    const { app } = getServerFirebase();
    const file = getStorage(app).bucket().file(`products/${randomUUID()}.webp`);
    const token = randomUUID();
    try {
      await file.save(output, { resumable: false, metadata: { contentType: "image/webp", cacheControl: "public,max-age=31536000,immutable", metadata: { firebaseStorageDownloadTokens: token } } });
      // The generated token grants public access to this product photo only.
      const origin = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com";
      return adminJson({ url: `${origin}/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}` }, 201);
    } catch { throw new ProductError(503, "Photo upload is unavailable. Check that Firebase Storage is enabled and the configured bucket is accessible, then try again."); }
  } catch (error) { return adminFailure(error); }
}
