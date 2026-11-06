/** Presentation-only overrides. Exact paths keep unrelated and large-size photos intact. */
export type SeasonalPhoto = {
  src: string;
  alt: string;
  position: string;
  mobilePosition: string;
};

const photo = (file: string, alt: string, position = "50% 60%", mobilePosition = position): SeasonalPhoto => ({
  src: `/images/christmas/${file}.webp`, alt, position, mobilePosition,
});

export const seasonalImages: Record<string, SeasonalPhoto> = {
  "/images/brand/hero.webp": photo("hero-wide", "An assortment of Makalipie pies on a wooden table with subtle Christmas greenery", "50% 50%", "50% 50%"),
  "menu-hero": photo("menu-hero", "A whole Buko pie with coconut filling and a red flower in a Christmas table setting", "50% 72%", "50% 73%"),
  "/images/brand/buko.webp": photo("buko", "Buko pie with coconut filling and a red flower on a wooden board in a Christmas setting", "50% 67%"),
  "/images/brand/apple.webp": photo("apple", "Apple crumble pie on a wooden board in a Christmas setting", "50% 65%"),
  "/images/brand/pumpkin-spice.webp": photo("pumpkin-spice", "A slice of Pumpkin Spice tart with cream and a leaf cookie in a Christmas setting", "50% 63%"),
  "/images/brand/keylime.webp": photo("keylime", "Keylime tart with its original cream swirl and lime zest in a subtly festive setting"),
  "/images/brand/pecan.webp": photo("pecan", "Pecan tarts with their original caramel and nut topping in a subtly festive setting", "82% 52%"),
  "/images/brand/banoffee.webp": photo("banoffee", "Banoffee tart with banana, caramel, cream and chocolate shavings in a subtly festive setting"),
  "/images/brand/smores.webp": photo("smores", "S’mores tart with three toasted marshmallows in a subtly festive setting", "50% 50%"),
  "/images/brand/oreo.webp": photo("oreo", "Oreo tart slices with cookies-and-cream filling in a subtly festive setting", "50% 55%"),
  "/images/brand/butter-chicken.webp": photo("butter-chicken", "A Butter Chicken Curry pie opened by hand to show its filling, with a subtly festive background", "50% 50%"),
};

export function seasonalPhoto(src: unknown, enabled = true, key?: string): SeasonalPhoto | undefined {
  return enabled && typeof src === "string" ? seasonalImages[key ?? src] : undefined;
}
