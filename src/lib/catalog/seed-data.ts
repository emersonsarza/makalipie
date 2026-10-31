import { featuredMenuSlugs, site } from "@/lib/site";

export type SeedSize = {
  id: "4-inch" | "10-inch";
  label: '4"' | '10"';
  priceCentavos: number;
  minLeadDays: number;
  /** Empty means every day. */
  availableWeekdays: number[];
  mode: "regular" | "preorder";
  image?: { url: string; alt: string };
};

export type SeedProduct = {
  id: string;
  name: string;
  blurb: string;
  description: string;
  category: "sweet" | "savory";
  image: { url: string; alt: string };
  publicNotes: string;
  menuCategoryId: string;
  sortOrder: number;
  availableWeekdays: number[];
  sizes: SeedSize[];
};

const weekend = [5, 6, 0];
const daily: number[] = [];

function fourInch(pricePesos: number, leadDays: number, mode: SeedSize["mode"], days: number[]): SeedSize {
  return { id: "4-inch", label: '4"', priceCentavos: pricePesos * 100, minLeadDays: leadDays, availableWeekdays: days, mode };
}

function tenInch(pricePesos: number, file: string, alt: string): SeedSize {
  return { id: "10-inch", label: '10"', priceCentavos: pricePesos * 100, minLeadDays: 3, availableWeekdays: daily, mode: "preorder", image: { url: `/images/brand/${file}.webp`, alt } };
}

/** Same size record the admin seed writes. Weekdays stay on the product and section. */
export function seedVariantRecord(size: SeedSize) {
  const { mode, availableWeekdays: _availableWeekdays, ...fields } = size;
  return { ...fields, pricingMode: "fixed" as const, orderMode: mode, minLeadDays: mode === "preorder" ? fields.minLeadDays : 0, active: true, sortOrder: size.id === "4-inch" ? 0 : 1 };
}

const everyDay = [0, 1, 2, 3, 4, 5, 6];
export const seedSections = [
  { id: "classic-flavors", name: "Classic flavors", note: "", sortOrder: 0, availableWeekdays: everyDay },
  { id: "weekend-specials", name: "Weekend specials", note: "Friday to Sunday", sortOrder: 1, availableWeekdays: weekend },
  { id: "october-special", name: "October special", note: "", sortOrder: 2, availableWeekdays: everyDay },
];

export const seedProducts: SeedProduct[] = [
  {
    id: "keylime",
    name: "Keylime",
    category: "sweet",
    menuCategoryId: "classic-flavors",
    sortOrder: 0,
    availableWeekdays: daily,
    publicNotes: "",
    blurb: "Tart, sunny, and a little tropical. A squeeze of sunshine in a flaky shell.",
    description: "A zesty, tangy delight with a smooth lime filling on a graham crust, finished with a dollop of whipped cream. Refreshingly irresistible.",
    image: { url: "/images/brand/keylime.webp", alt: "A Keylime tart with graham crust, creamy lime filling, and whipped cream" },
    sizes: [fourInch(240, 0, "regular", daily), tenInch(2500, "keylime-10", "A large Keylime tart with graham crust, creamy lime filling, and whipped cream")],
  },
  {
    id: "pecan",
    name: "Pecan",
    category: "sweet",
    menuCategoryId: "classic-flavors",
    sortOrder: 1,
    availableWeekdays: daily,
    publicNotes: "",
    blurb: "Toasty pecans, caramel-deep sweetness, and that crackly top we all fight over.",
    description: "A decadent mix of buttery caramel and toasted pecans on our signature all butter shortcrust.",
    image: { url: "/images/brand/pecan.webp", alt: "A whole pecan tart with a golden fluted crust and glossy toasted pecans" },
    sizes: [fourInch(240, 0, "regular", daily), tenInch(2500, "pecan-10", "A large pecan tart with a golden fluted crust and glossy toasted pecans")],
  },
  {
    id: "banoffee",
    name: "Banoffee",
    category: "sweet",
    menuCategoryId: "classic-flavors",
    sortOrder: 2,
    availableWeekdays: daily,
    publicNotes: "",
    blurb: "Banana, toffee, cream. The kind of slice that makes people close their eyes.",
    description: "A heavenly blend of bananas and creamy caramel, topped with whipped cream for a classic indulgence.",
    image: { url: "/images/brand/banoffee.webp", alt: "A slice of Banoffee tart with banana, caramel, and cream" },
    sizes: [fourInch(240, 0, "regular", daily), tenInch(2500, "banoffee-10", "A large Banoffee tart with banana, caramel, and cream")],
  },
  {
    id: "smores",
    name: "S’mores",
    category: "sweet",
    menuCategoryId: "classic-flavors",
    sortOrder: 3,
    availableWeekdays: daily,
    publicNotes: "",
    blurb: "Campfire nostalgia: toasted marshmallow, chocolate, and a graham-kissed crust.",
    description: "A rich chocolate ganache topped with graham and gooey marshmallows for the ultimate treat.",
    image: { url: "/images/brand/smores.webp", alt: "Close-up of a chocolate tart topped with toasted marshmallow" },
    sizes: [fourInch(190, 0, "regular", daily), tenInch(1900, "smores-10", "A large chocolate tart topped with toasted marshmallow")],
  },
  {
    id: "oreo",
    name: "Oreo",
    category: "sweet",
    menuCategoryId: "classic-flavors",
    sortOrder: 4,
    availableWeekdays: daily,
    publicNotes: "",
    blurb: "Cookies-and-cream comfort, piled into our handcrafted crust.",
    description: "A rich and creamy Oreo-infused white chocolate ganache with layers of crushed cookies, a true crowd-pleaser.",
    image: { url: "/images/brand/oreo.webp", alt: "Oreo tart slices with cookies-and-cream filling" },
    sizes: [fourInch(190, 0, "regular", daily), tenInch(1900, "oreo-10", "A large Oreo tart with cookies-and-cream filling")],
  },
  {
    id: "apple",
    name: "Apple",
    category: "sweet",
    menuCategoryId: "weekend-specials",
    sortOrder: 5,
    availableWeekdays: weekend,
    publicNotes: "Friday to Sunday.",
    blurb: "Spiced apple and a buttery oat crumble in our handcrafted crust.",
    description: "A warm apple filling under a golden oat crumble, baked in our handcrafted crust. This description is a placeholder until it is replaced.",
    image: { url: "/images/brand/apple.webp", alt: "An apple tart with oat crumble and caramel on a gold board" },
    sizes: [fourInch(280, 0, "regular", weekend), tenInch(2800, "apple-10", "A large apple tart with oat crumble and caramel")],
  },
  {
    id: "buko",
    name: "Buko",
    category: "sweet",
    menuCategoryId: "weekend-specials",
    sortOrder: 6,
    availableWeekdays: weekend,
    publicNotes: "Friday to Sunday.",
    blurb: "Young coconut, creamy filling, and the crust that started all the DMs.",
    description: "Our bestseller: young coconut cream in a handcrafted crust. Available Friday to Sunday. Message us to secure a pie.",
    image: { url: "/images/brand/buko.webp", alt: "A young coconut cream tart with a red flower on a gold board" },
    sizes: [fourInch(280, 0, "regular", weekend), tenInch(1900, "buko-10", "A large young coconut cream tart")],
  },
  {
    id: "butter-chicken-curry",
    name: "Butter Chicken Curry",
    category: "savory",
    menuCategoryId: "weekend-specials",
    sortOrder: 7,
    availableWeekdays: weekend,
    publicNotes: "Friday to Sunday.",
    blurb: "Slow, saucy, and wrapped in that one-of-a-kind flaky crust. A little savoury comfort.",
    description: "Homemade Indian butter chicken curry in our French all-butter flaky crust. Ask us about the current batch at Streetscape.",
    image: { url: "/images/brand/butter-chicken.webp", alt: "A flaky Butter Chicken Curry pie broken open to show the chicken filling" },
    sizes: [fourInch(300, 0, "regular", weekend)],
  },
  {
    id: "pumpkin-spice",
    name: "Pumpkin Spice",
    category: "sweet",
    menuCategoryId: "october-special",
    sortOrder: 8,
    availableWeekdays: daily,
    publicNotes: "October special.",
    blurb: "Warm pumpkin filling, cream, and a leaf cookie. Our October special.",
    description: "Smooth pumpkin filling finished with cream and a leaf cookie. This description is a placeholder until it is replaced.",
    image: { url: "/images/brand/pumpkin-spice.webp", alt: "A small pumpkin tart with cream and a leaf cookie on a gold board" },
    sizes: [fourInch(260, 0, "regular", daily), tenInch(2600, "pumpkin-spice-10", "A large pumpkin tart with a whipped-cream border and leaf cookies on a white board")],
  },
];

export const seedAddons = [
  {
    id: "birthday-topper",
    name: "Birthday Topper",
    priceCentavos: 800,
    image: { url: "/brand/seal.png", alt: "Makalipie seal" },
    minLeadDays: 0,
    allergens: [] as string[],
    active: true,
    sortOrder: 0,
    scope: "per_order" as const,
    customization: { enabled: false, label: "", required: false, maxLength: 100 },
    version: 1,
  },
  {
    id: "note-card",
    name: "Note Card With Ribbon",
    priceCentavos: 1500,
    image: { url: "/brand/seal.png", alt: "Makalipie seal" },
    minLeadDays: 0,
    allergens: [] as string[],
    active: true,
    sortOrder: 1,
    scope: "per_order" as const,
    customization: { enabled: true, label: "Message for note card", required: false, maxLength: 300 },
    version: 1,
  },
];

export const seedBranchSettings = {
  version: 1,
  defaultBranch: "cebu",
  branches: [
    {
      id: "cebu",
      name: "Cebu",
      address: "2nd Floor, Streetscape, Banilad, Cebu City",
      visible: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      mapUrl: site.mapsUrl,
      hoursLabel: "Daily, 10am to 8pm",
      customerLimit: null,
      areas: [] as string[],
    },
  ],
  assignments: seedProducts.flatMap((product) => product.sizes.map((size) => ({
    productId: product.id,
    variantId: size.id,
    branchIds: ["cebu"],
    mode: size.mode,
  }))),
};

export const seedPopups = {
  version: 1,
  listings: [
    {
      id: "sunday-market",
      name: "Sunday Market",
      address: "Mindanao Avenue, Cebu Business Park, Cebu City",
      mapUrl: "https://www.google.com/maps/dir/?api=1&destination=Cebu+Sunday+Market+Mindanao+Avenue+Cebu+Business+Park+Cebu+City",
      startDate: "2026-10-25",
      endDate: "2026-10-25",
      hours: "7am–3pm",
      items: ["Butter Chicken Curry"],
    },
  ],
};

export const seedSchedule = {
  version: 1,
  bookingHorizonDays: 30,
  branches: {
    cebu: { enabled: true, startTime: "10:00", cutoffTime: "19:00", openWeekdays: [0, 1, 2, 3, 4, 5, 6], closedDates: [] as string[] },
  },
};

export const seedShop = {
  links: {
    instagram: site.instagramUrl,
    instagramDm: site.instagramDmUrl,
    messenger: "",
    grabFood: site.grabUrl,
    foodpanda: site.foodpandaUrl,
  },
  requireFullPaymentDefault: false,
  customerEditDefault: false,
  holdMinutes: 30,
  confirmBeforeSlotMinutes: 60,
  defaultPreorderLeadDays: 3,
  featuredProductIds: [...featuredMenuSlugs],
};

export const seedPackages = { version: 0, packages: [] as [] };
