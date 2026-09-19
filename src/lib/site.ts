export const site = {
  name: "Makalipie",
  tagline: "Making people happy, one pie at a time",
  slogan: "Makalipie gyud ni!",
  description:
    "Proudly Cebuana-made tarts and pies with a one-of-a-kind handcrafted crust. Visit us at Streetscape, Banilad, Cebu.",
  established: 2020,
  instagramHandle: "makalipie",
  instagramUrl: "https://www.instagram.com/makalipie/",
  foodpandaUrl:
    "https://www.foodpanda.ph/restaurant/gpj2/makalipie-paseo-saturnino",
  instagramDmUrl: "https://ig.me/m/makalipie",
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
    hoursLabel: "Daily 10AM - 8PM",
    opens: "10:00",
    closes: "20:00",
  },
  sundayMarket: {
    name: "Sunday Market",
    item: "Butter Chicken Curry pie",
    hoursLabel: "Sundays ~7AM - 3PM",
    opens: "07:00",
    closes: "15:00",
  },
} as const;

export const nav = [
  { href: "/menu", label: "Menu" },
  { href: "/#story", label: "Our story" },
  { href: "/#visit", label: "Visit" },
  { href: "/order", label: "Order" },
] as const;

export const navHashIds = ["story", "visit"] as const;

export type MenuItem = {
  slug: string;
  name: string;
  kind: "sweet" | "savory";
  blurb: string;
  description: string;
  price?: number;
  priceLabel?: string;
  note?: string;
  bestseller?: boolean;
  image: {
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
    blurb:
      "Tart, sunny, and a little tropical. A squeeze of sunshine in a flaky shell.",
    description:
      "A zesty, tangy delight with a smooth lime filling on a graham crust, finished with a dollop of whipped cream. Refreshingly irresistible.",
    image: {
      src: "/images/brand/keylime.webp",
      alt: "A Keylime tart with graham crust, creamy lime filling, and whipped cream",
    },
  },
  {
    slug: "pecan",
    name: "Pecan",
    kind: "sweet",
    price: 240,
    blurb:
      "Toasty pecans, caramel-deep sweetness, and that crackly top we all fight over.",
    description:
      "A decadent mix of buttery caramel and toasted pecans on our signature all butter shortcrust.",
    image: {
      src: "/images/brand/pecan.webp",
      alt: "A whole pecan tart with a golden fluted crust and glossy toasted pecans",
    },
  },
  {
    slug: "smores",
    name: "S’mores",
    kind: "sweet",
    price: 190,
    blurb:
      "Campfire nostalgia: toasted marshmallow, chocolate, and a graham-kissed crust.",
    description:
      "A rich chocolate ganache topped with graham and gooey marshmallows for the ultimate treat.",
    image: {
      src: "/images/brand/smores.webp",
      alt: "Close-up of a chocolate tart topped with toasted marshmallow",
    },
  },
  {
    slug: "banoffee",
    name: "Banoffee",
    kind: "sweet",
    price: 240,
    blurb:
      "Banana, toffee, cream. The kind of slice that makes people close their eyes.",
    description:
      "A heavenly blend of bananas and creamy caramel, topped with whipped cream for a classic indulgence.",
    image: {
      src: "/images/brand/banoffee.webp",
      alt: "A slice of Banoffee tart with banana, caramel, and cream",
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
      src: "/images/brand/oreo.webp",
      alt: "Oreo tart slices with cookies-and-cream filling",
    },
  },
  {
    slug: "buko",
    name: "Buko",
    kind: "sweet",
    priceLabel: "DM for price",
    blurb:
      "Young coconut, creamy filling, and the crust that started all the DMs.",
    description:
      "Our bestseller: young coconut cream in a handcrafted crust. Available Friday to Sunday. Message us to secure a pie.",
    note: "Fri-Sun · pre-order via Instagram",
    bestseller: true,
    image: {
      src: "/images/menu/buko.jpg",
      alt: "Young coconut cream pie in a handcrafted crust, our Buko bestseller",
    },
  },
  {
    slug: "butter-chicken-curry",
    name: "Butter Chicken Curry pie",
    kind: "savory",
    priceLabel: "DM for price",
    blurb:
      "Slow, saucy, and wrapped in that one-of-a-kind flaky crust. A little savoury comfort.",
    description:
      "Homemade Indian butter chicken curry in our French all-butter flaky crust. Ask us about the current batch at Streetscape.",
    note: "Ask about availability at Streetscape",
    image: {
      src: "/images/menu/butter-chicken.jpg",
      alt: "Golden handcrafted crust, the shell for our Butter Chicken Curry pie",
    },
  },
];

export const sweetItems = menuItems.filter((item) => item.kind === "sweet");
export const savoryItems = menuItems.filter((item) => item.kind === "savory");

export const featuredMenuSlugs = ["buko", "smores", "pecan"] as const;

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
    detail: "We'll coordinate booking after confirmation",
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

export const pickupTimes = [
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
] as const;

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
    body: "Wait for your goodies to arrive! We'll update you on the day of delivery.",
  },
] as const;

export type Review = {
  quote: string;
  name: string;
  context: string;
};

export const reviews: Review[] = [];

export const heroImage = {
  src: "/images/hero.jpg",
  alt: "A toasted marshmallow tart with golden handcrafted crust, baked in Cebu",
} as const;

export const storyImages = {
  kitchen: {
    src: "/images/story/kitchen.jpg",
    alt: "S'mores and pecan tarts with golden handcrafted crusts",
  },
  crust: {
    src: "/images/story/crust.jpg",
    alt: "Close-up of Makalipie's flaky, golden tart crust",
  },
  bakery: {
    src: "/images/story/bakery.jpg",
    alt: "Toasted marshmallow tarts fresh from the bakery tray",
  },
} as const;

export function formatPrice(price: number) {
  return `₱${price.toLocaleString("en-PH")}`;
}

export function itemPriceText(item: Pick<MenuItem, "price" | "priceLabel">) {
  if (item.price != null) return formatPrice(item.price);
  return item.priceLabel ?? "DM for price";
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://makalipie.by1002.com";
}

export function getOrderSummarySource() {
  try {
    const url = new URL(getSiteUrl());
    return `${url.host}/order`;
  } catch {
    return "makalipie.by1002.com/order";
  }
}

const grabFoodStoreUrl = process.env.NEXT_PUBLIC_GRABFOOD_URL?.trim() ?? "";

export function getGrabFood() {
  if (grabFoodStoreUrl) {
    return {
      href: grabFoodStoreUrl,
      label: "Order on GrabFood",
      linked: true as const,
    };
  }
  return {
    href: null,
    label: "Search Makalipie on GrabFood",
    linked: false as const,
  };
}
