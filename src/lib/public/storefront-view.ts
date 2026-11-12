import type { PublicShopView } from "@/components/public-shop-provider";
import type { MenuSection } from "@/lib/catalog/sections";
import { menuItems, type MenuItem } from "@/lib/site";
import type { presentShop } from "@/lib/storefront/present";

export type PublishedShop = ReturnType<typeof presentShop>;

const knownKinds = new Map(menuItems.map(item => [item.slug, item.kind]));

export function menuFromShop(shop: PublishedShop, locationId = "cebu") {
  const sections: MenuSection[] = shop.menu.map((section, sortOrder) => ({
    id: section.id, name: section.name, note: section.note, sortOrder, availableWeekdays: section.weekdays,
  }));
  const items = shop.menu.flatMap(section => section.products.flatMap((product): MenuItem[] => {
    const sizes = product.sizes.filter(size => size.branchIds.includes(locationId));
    if (!sizes.length) return [];
    const image = product.themeImages.find(item => item.theme === shop.theme) ?? product.image;
    const price = Math.min(...sizes.map(size => size.priceCentavos)) / 100;
    return [{
      slug: product.id, name: product.name, kind: knownKinds.get(product.id) ?? "sweet",
      blurb: product.shortDescription, description: product.description, allergens: product.allergens,
      menuCategoryId: section.id, availableWeekdays: section.weekdays,
      image: { src: image.path, alt: image.alt },
      priceLabel: `From ₱${price.toLocaleString("en-PH")}`,
      variants: sizes.map((size, sortOrder) => ({
        id: size.id, label: size.label, priceCentavos: size.priceCentavos, pricingMode: "fixed",
        minLeadDays: size.mode === "preorder" ? shop.settings.preorderLeadDays : 0,
        orderMode: size.mode, sortOrder, active: true,
        image: { url: size.image.path, alt: size.image.alt },
      })),
    }];
  }));
  return { items, sections, unavailable: false };
}

export function publicShopView(shop: PublishedShop): PublicShopView {
  const cebu = shop.locations.find(location => location.id === "cebu");
  return {
    branchName: cebu?.name ?? "Cebu", address: cebu?.address ?? "", hoursLabel: cebu?.hoursLabel ?? "", mapUrl: cebu?.mapUrl ?? "",
    defaultPreorderLeadDays: shop.settings.preorderLeadDays, featuredProductIds: shop.featured,
    deliveryAvailable: shop.locations.some(location => location.kind === "regular" && location.deliveryEnabled),
    branches: shop.locations.filter(location => location.kind === "regular").map(location => ({
      id: location.id, name: location.name, visible: true, address: location.address, hoursLabel: location.hoursLabel,
      mapUrl: location.mapUrl, deliveryEnabled: location.deliveryEnabled, pickupEnabled: location.pickupEnabled, customerLimit: null, areas: [],
    })),
    locations: { upcoming: shop.popups, recent: [] },
    links: {
      instagram: shop.preview ? "" : shop.settings.instagramUrl,
      instagramDm: shop.preview ? "" : shop.settings.instagramDmUrl,
      messenger: shop.preview ? "" : shop.settings.messengerUrl,
      grabFood: shop.preview ? "" : cebu?.grabFoodUrl ?? "",
      foodpanda: shop.preview ? "" : cebu?.foodpandaUrl ?? "",
    },
  };
}
