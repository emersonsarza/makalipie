export const site = {
  name: "Makalipie",
  tagline: "Where every bite tastes like home",
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
  { href: "#menu", label: "Menu" },
  { href: "#story", label: "Our story" },
  { href: "#visit", label: "Visit" },
  { href: "#order", label: "How to order" },
] as const;

export type MenuItem = {
  slug: string;
  name: string;
  kind: "sweet" | "savory";
  blurb: string;
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
    blurb: "Tart, sunny, and a little tropical — a squeeze of sunshine in a flaky shell.",
    image: {
      src: "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=1200&q=80",
      alt: "A citrus tart with a golden crust and creamy yellow filling, garnished with lime zest",
    },
  },
  {
    slug: "pecan",
    name: "Pecan",
    kind: "sweet",
    blurb: "Toasty pecans, caramel-deep sweetness, and that crackly top we all fight over.",
    image: {
      src: "https://images.unsplash.com/photo-1621743478914-cc8a16d7d0e5?auto=format&fit=crop&w=1200&q=80",
      alt: "A rustic pie with a deeply golden, flaky crust sitting on a wooden table",
    },
  },
  {
    slug: "smores",
    name: "S’mores",
    kind: "sweet",
    blurb: "Campfire nostalgia: toasted marshmallow, chocolate, and a graham-kissed crust.",
    image: {
      src: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80",
      alt: "A rich chocolate dessert with a crackled top, close-up in warm light",
    },
  },
  {
    slug: "banoffee",
    name: "Banoffee",
    kind: "sweet",
    blurb: "Banana, toffee, cream — the kind of slice that makes people close their eyes.",
    image: {
      src: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
      alt: "Creamy layered dessert cups with caramel tones and a dusting of cocoa",
    },
  },
  {
    slug: "oreo",
    name: "Oreo",
    kind: "sweet",
    blurb: "Cookies-and-cream comfort, piled into our handcrafted crust.",
    image: {
      src: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1200&q=80",
      alt: "A cookies-and-cream style dessert with dark cookie crumbs and whipped topping",
    },
  },
  {
    slug: "buko",
    name: "Buko",
    kind: "sweet",
    blurb: "Young coconut, creamy filling, and the crust that started all the DMs.",
    note: "Bestseller · Fri–Sun · message us to order",
    bestseller: true,
    image: {
      src: "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=1200&q=80",
      alt: "Fresh young coconuts and creamy white coconut meat, suggesting buko pie filling",
    },
  },
  {
    slug: "butter-chicken-curry",
    name: "Butter Chicken Curry pie",
    kind: "savory",
    blurb: "Slow, saucy, and wrapped in that one-of-a-kind flaky crust. Sunday’s savory hero.",
    note: "Sunday Market · ~7AM–3PM",
    image: {
      src: "https://images.unsplash.com/photo-1608039829574-aaa80e85ba42?auto=format&fit=crop&w=1400&q=80",
      alt: "A savory pie with a deeply golden flaky crust, sliced to show a rich filling",
    },
  },
];

export const sweetItems = menuItems.filter((item) => item.kind === "sweet");
export const savoryItems = menuItems.filter((item) => item.kind === "savory");

export const storyImages = {
  kitchen: {
    src: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1400&q=80",
    alt: "A baker rolling dough on a floured wooden counter in a warm kitchen",
  },
  crust: {
    src: "https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=1400&q=80",
    alt: "A fruit tart with a scalloped pastry crust and glossy berries on top",
  },
  bakery: {
    src: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    alt: "Rows of freshly baked golden pastries cooling in a bakery",
  },
} as const;

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://makalipie.vercel.app";
}
