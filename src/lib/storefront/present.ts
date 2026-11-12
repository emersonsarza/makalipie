import { manilaDate } from "../catalog/rules";
import { branchWindow, orderableDates, seasonVisible, sizeEligibleOnDate } from "./eligibility";
import { bySort, selectFeatured } from "./featured";
import { resolveSizeImage } from "./images";
import type { StoreCatalog, StoreProduct, ThemeName } from "./types";

export { selectFeatured } from "./featured";

function visibleLocations(catalog: StoreCatalog) {
  return catalog.locations.filter((location) => location.visible);
}

function onMenu(catalog: StoreCatalog, product: StoreProduct, locationIds: Set<string>, now: Date) {
  const assigned = [...locationIds].filter((locationId) => (
    product.sizes.some((size) => size.enabled && size.branchIds.includes(locationId))
  ));
  return product.enabled && assigned.some((locationId) => seasonVisible(catalog, product, locationId, now));
}

export function presentShop(catalog: StoreCatalog, now = new Date(), options?: { theme?: ThemeName; preview?: boolean }) {
  const theme = options?.theme ?? catalog.settings.theme;
  const locations = visibleLocations(catalog).map((location) => ({
    id: location.id,
    kind: location.kind,
    name: location.name,
    address: location.address,
    mapUrl: location.mapUrl,
    hoursLabel: location.hoursLabel,
    pickupEnabled: location.pickupEnabled,
    deliveryEnabled: location.deliveryEnabled,
    acceptingOrders: options?.preview ? false : location.acceptingOrders,
    grabFoodUrl: location.grabFoodUrl,
    foodpandaUrl: location.foodpandaUrl,
  }));
  const locationIds = new Set(locations.map((location) => location.id));
  const menu = [...catalog.sections].sort(bySort).flatMap((section) => {
    const products = catalog.products
      .filter((product) => product.sectionId === section.id && onMenu(catalog, product, locationIds, now))
      .sort(bySort)
      .map((product) => ({
        id: product.id,
        name: product.name,
        shortDescription: product.shortDescription,
        description: product.description,
        allergens: product.allergens,
        seasonStart: product.seasonStart,
        seasonEnd: product.seasonEnd,
        image: product.image,
        themeImages: product.themeImages,
        sizes: product.sizes
          .filter((size) => size.enabled && size.branchIds.some((id) => locationIds.has(id)))
          .sort(bySort)
          .map((size) => ({
            id: size.id,
            label: size.label,
            priceCentavos: size.priceCentavos,
            mode: size.mode,
            branchIds: size.branchIds.filter((id) => locationIds.has(id)),
            themeImages: size.themeImages,
            image: resolveSizeImage({
              theme,
              sizeImage: size.image,
              themeImages: size.themeImages,
              productImage: product.image,
            }),
          })),
      }));
    if (!products.length) return [];
    return [{ id: section.id, name: section.name, note: section.note, weekdays: section.weekdays, products }];
  });
  const today = manilaDate(now);
  return {
    preview: Boolean(options?.preview),
    theme,
    revision: catalog.revision,
    today,
    settings: {
      bookingHorizonDays: catalog.settings.bookingHorizonDays,
      preorderLeadDays: catalog.settings.preorderLeadDays,
      instagramUrl: catalog.settings.instagramUrl,
      instagramDmUrl: catalog.settings.instagramDmUrl,
      messengerUrl: catalog.settings.messengerUrl,
    },
    locations,
    menu,
    addOns: catalog.addOns
      .filter((addOn) => addOn.enabled && addOn.locationIds.some((id) => locationIds.has(id)))
      .sort(bySort)
      .map((addOn) => ({
        id: addOn.id,
        name: addOn.name,
        priceCentavos: addOn.priceCentavos,
        icon: addOn.icon,
        locationIds: addOn.locationIds.filter((id) => locationIds.has(id)),
      })),
    featured: selectFeatured(catalog, now),
    popups: catalog.popups
      .filter((popup) => popup.endDate >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))
      .map((popup) => ({
        id: popup.id,
        locationId: popup.locationId,
        city: catalog.locations.find(location => location.id === popup.locationId)?.name,
        name: popup.name,
        address: popup.address,
        mapUrl: popup.mapUrl,
        startDate: popup.startDate,
        endDate: popup.endDate,
        hours: popup.hours,
        items: popup.items,
      })),
  };
}

export function presentEligibility(catalog: StoreCatalog, locationId: string, now = new Date()) {
  const location = catalog.locations.find((item) => item.id === locationId && item.visible);
  if (!location) return null;
  const today = manilaDate(now);
  const dates = orderableDates(catalog, locationId, now);
  const products = catalog.products.flatMap((product) => {
    if (!product.enabled) return [];
    const section = catalog.sections.find((item) => item.id === product.sectionId);
    const sizes = product.sizes.flatMap((size) => {
      if (!size.enabled || !size.branchIds.includes(locationId)) return [];
      const available = dates
        .filter((day) => sizeEligibleOnDate(catalog, product, size, section, locationId, day.date, now))
        .map((day) => day.date);
      return available.length ? [{ id: size.id, dates: available }] : [];
    });
    return sizes.length ? [{ id: product.id, sizes }] : [];
  });
  return {
    locationId,
    today,
    todayOrderingWindow: branchWindow(catalog, locationId, today),
    acceptingOrders: location.acceptingOrders,
    dates,
    products,
  };
}
