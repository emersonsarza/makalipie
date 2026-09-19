import { createSocialImage } from "@/lib/social-image";

export const alt =
  "Makalipie menu — Sweet tarts, Buko weekends and savoury pies.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createSocialImage("menu");
}
