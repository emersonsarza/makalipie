export const site = {
  name: "Makalipie",
  tagline: "Where every bite tastes like home",
  slogan: "Makalipie gyud ni!",
  description:
    "Proudly Cebuana-made tarts and pies with a one-of-a-kind handcrafted crust. Visit us at Streetscape, Banilad, Cebu.",
  established: 2020,
  instagramHandle: "makalipie",
  instagramUrl: "https://www.instagram.com/makalipie/",
  instagramDmUrl: "https://ig.me/m/makalipie",
  grabFoodUrl: "https://food.grab.com/ph/en/",
  grabFoodLabel: "Search Makalipie on GrabFood",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Streetscape%20Banilad%20Cebu",
  mapsEmbedUrl:
    "https://maps.google.com/maps?q=Streetscape%20Banilad%20Cebu&t=&z=16&ie=UTF8&iwloc=&output=embed",
  timezone: "Asia/Manila",
  kiosk: {
    name: "Streetscape kiosk",
    floor: "2nd Floor",
    place: "Streetscape, Banilad",
    city: "Cebu",
    hoursLabel: "Daily 10AM — 8PM",
    opens: "10:00",
    closes: "20:00",
  },
  sundayMarket: {
    name: "Sunday Market",
    item: "Butter Chicken Curry pie",
    hoursLabel: "Sundays ~7AM — 3PM",
    opens: "07:00",
    closes: "15:00",
  },
} as const;

export const nav = [
  { href: "/menu", label: "Menu" },
  { href: "/#visit", label: "Visit" },
  { href: "/order", label: "Order" },
] as const;

export type MenuItem = {
  slug: string;
  name: string;
  kind: "sweet" | "savory";
  blurb: string;
  description: string;
  price?: number;
  note?: string;
  bestseller?: boolean;
  image?: {
    src: string;
    alt: string;
  };
};

export const menuItems: MenuItem[] = [
  {
    slug: "keylime",
    name: "Keylime",
    kind: "sweet",
    price: 240,
    blurb: "Tart, sunny, and a little tropical — a squeeze of sunshine in a flaky shell.",
    description:
      "A zesty, tangy delight with a smooth lime filling on a graham crust, finished with a dollop of whipped cream—refreshingly irresistible.",
    image: {
      src: "/brand/pies/keylime-hero.jpg",
      alt: "Keylime tart slice with whipped cream, lime zest, and a graham crust",
    },
  },
  {
    slug: "pecan",
    name: "Pecan",
    kind: "sweet",
    price: 240,
    blurb: "Toasty pecans, caramel-deep sweetness, and that crackly top we all fight over.",
    description:
      "A decadent mix of buttery caramel and toasted pecans on our signature all butter shortcrust.",
    image: {
      src: "/brand/pies/pecan-photo.jpg",
      alt: "Pecan tart with a glossy caramel filling and toasted pecan halves in a scalloped crust",
    },
  },
  {
    slug: "smores",
    name: "S’mores",
    kind: "sweet",
    price: 190,
    blurb: "Campfire nostalgia: toasted marshmallow, chocolate, and a graham-kissed crust.",
    description:
      "A rich chocolate ganache topped with graham and gooey marshmallows for the ultimate treat.",
    image: {
      src: "/brand/pies/smores-photo.jpg",
      alt: "Toasted marshmallow squares on a chocolate tart with a scalloped crust",
    },
  },
  {
    slug: "banoffee",
    name: "Banoffee",
    kind: "sweet",
    price: 240,
    blurb: "Banana, toffee, cream — the kind of slice that makes people close their eyes.",
    description:
      "A heavenly blend of bananas and creamy caramel, topped with whipped cream for a classic indulgence.",
    image: {
      src: "/brand/pies/banoffee.jpg",
      alt: "Banoffee slice with banana, toffee, and cream on a graham crust",
    },
  },
  {
    slug: "oreo",
    name: "Oreo",
    kind: "sweet",
    price: 190,
    blurb: "Cookies-and-cream comfort, piled into our handcrafted crust.",
    description:
      "A rich and creamy Oreo-infused white chocolate ganache with layers of crushed cookies, a true crowd-pleaser.",
    image: {
      src: "/brand/pies/oreo.jpg",
      alt: "Oreo tart with white chocolate ganache and crushed cookie layers",
    },
  },
  {
    slug: "buko",
    name: "Buko",
    kind: "sweet",
    blurb: "Young coconut, creamy filling, and the crust that started all the DMs.",
    description:
      "Our bestseller: young coconut cream in a handcrafted crust. Available Friday to Sunday — message us to secure a pie.",
    note: "Bestseller · Fri–Sun · message us to order",
    bestseller: true,
  },
  {
    slug: "butter-chicken-curry",
    name: "Butter Chicken Curry pie",
    kind: "savory",
    blurb: "Slow, saucy, and wrapped in that one-of-a-kind flaky crust. Sunday’s savory hero.",
    description:
      "Slow, saucy butter chicken curry wrapped in our one-of-a-kind flaky crust. Find it at the Sunday market.",
    note: "Sunday Market · ~7AM–3PM",
  },
];

export const sweetItems = menuItems.filter((item) => item.kind === "sweet");
export const savoryItems = menuItems.filter((item) => item.kind === "savory");

export const featuredMenuSlugs = [
  "keylime",
  "pecan",
  "banoffee",
] as const;

export const addons = [
  {
    id: "birthday-topper",
    label: "Birthday Topper",
    price: 8,
  },
  {
    id: "note-card",
    label: "Note Card With Ribbon",
    price: 15,
    hasMessage: true,
  },
] as const;

export const deliveryOptions = [
  {
    id: "pickup",
    label: "Pickup",
    detail: "2nd Floor, Streetscape, Banilad",
    needsAddress: false,
  },
  {
    id: "lalamove",
    label: "Delivery (Lalamove)",
    detail: "We’ll coordinate booking after confirmation",
    needsAddress: true,
  },
] as const;

export const paymentMethods = [
  { id: "bank", label: "Bank Transfer" },
  { id: "gcash", label: "GCash" },
  { id: "cash", label: "Cash upon Pickup/Delivery" },
] as const;

export const bankDetails = {
  bank: "UnionBank",
  accountName: "Makalipie Homemade Food Retailing",
  accountNumber: "0006 6002 9224",
  gcashName: "DO*****A A** M.",
} as const;

export const orderSteps = [
  {
    step: 1,
    title: "Order",
    body: "Browse our menu and send your filled-out order form through our Instagram inbox.",
  },
  {
    step: 2,
    title: "Confirmation",
    body: "Wait for our order confirmation and invoice.",
  },
  {
    step: 3,
    title: "Payment",
    body: "Pay, then submit your proof of payment to secure your slot.",
  },
  {
    step: 4,
    title: "Delivery",
    body: "Wait for your goodies to arrive! We’ll update you on the day of delivery.",
  },
] as const;

export const reviews = [
  {
    quote:
      "The crust alone is worth the trip to Streetscape. Buko on Friday is non-negotiable now.",
    name: "Aya M.",
    context: "Regular · Banilad",
  },
  {
    quote:
      "Ordered pecan and keylime for a office treat — they disappeared before I got a second slice.",
    name: "Jon R.",
    context: "Corporate box",
  },
  {
    quote:
      "Makalipie gyud ni! Warm, handmade, and the DMs are always kind. Tag us next time you visit.",
    name: "Kai L.",
    context: "Sunday market",
  },
] as const;

export const storyImages = {
  counter: {
    src: "/brand/pies/counter.jpg",
    alt: "Pecan and chocolate tarts on wooden boards at the Makalipie counter",
  },
  pecan: {
    src: "/brand/pies/pecan-photo.jpg",
    alt: "Close-up of a Makalipie pecan tart in a scalloped crust",
  },
  smores: {
    src: "/brand/pies/smores-photo.jpg",
    alt: "Toasted marshmallow tart from Makalipie",
  },
} as const;

export function formatPrice(price: number) {
  return `₱${price.toLocaleString("en-PH")}`;
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://makalipie.by1002.com";
}
