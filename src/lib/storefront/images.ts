import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEFAULT_PRODUCT_IMAGE, type StoreImage, type ThemeName } from "./types";

const IMAGE_PATH = /^\/images\/[A-Za-z0-9_./-]+\.webp$/;

export function assetManifest(root = join(process.cwd(), "public")): string[] {
  const images = join(root, "images");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.toLowerCase().endsWith(".webp")) found.push(`/${relative(root, full).split(sep).join("/")}`);
    }
  };
  walk(images);
  return found.filter((path) => IMAGE_PATH.test(path)).sort();
}

export function knownImage(path: string, manifest = assetManifest()): boolean {
  return IMAGE_PATH.test(path) && manifest.includes(path);
}

export function resolveSizeImage(input: {
  theme: ThemeName;
  sizeImage: StoreImage | null;
  themeImages: { theme: ThemeName; path: string; alt: string }[];
  productImage: StoreImage | null;
}): StoreImage {
  const themed = input.themeImages.find((image) => image.theme === input.theme);
  if (themed) return { path: themed.path, alt: themed.alt };
  if (input.sizeImage) return input.sizeImage;
  if (input.productImage) return input.productImage;
  return { ...DEFAULT_PRODUCT_IMAGE };
}
