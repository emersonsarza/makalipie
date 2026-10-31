import type { MenuItem } from "@/lib/site";
import { variantOrderMode } from "@/lib/catalog/mode";
import type { Variant } from "@/lib/catalog/schema";

/** Shared by the rendered menu and its structured data. */
export function menuSizes(items: MenuItem[], preorder: boolean): MenuItem[] {
  return items.flatMap(item => {
    const variants = (item.variants ?? []).filter(variant => variant.active && variantOrderMode(variant) === (preorder ? "preorder" : "regular"));
    return variants.length ? [withVariantPrice(item, variants)] : [];
  });
}

function withVariantPrice(item: MenuItem, variants: Variant[]): MenuItem {
  const prices = variants.flatMap((variant) => variant.pricingMode === "fixed" && variant.priceCentavos != null ? [variant.priceCentavos / 100] : []);
  const allFixed = prices.length === variants.length;
  const price = variants.length === 1 && allFixed ? prices[0] : undefined;
  const priceLabel = prices.length ? `From ₱${Math.min(...prices).toLocaleString("en-PH")}${allFixed ? "" : " · other sizes quoted"}` : "DM for price";
  return { ...item, variants, price, priceLabel, image: cardImage(item, variants) };
}

/** One shared size photo, or the only size's photo, replaces the product image. Mixed photos stay on the product image. */
function cardImage(item: MenuItem, variants: Variant[]): MenuItem["image"] {
  const photos = variants.flatMap((variant) => variant.image ? [variant.image] : []);
  const shared = photos.length === variants.length && photos.every((photo) => photo.url === photos[0].url && photo.alt === photos[0].alt);
  const only = variants.length === 1 && photos.length === 1;
  return shared || only ? { src: photos[0].url, alt: photos[0].alt } : item.image;
}
