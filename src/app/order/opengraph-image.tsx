import { createSocialImage } from "@/lib/social-image";

export const alt =
  "Order Makalipie — Put together a box of handcrafted pies and confirm on Instagram.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createSocialImage("order");
}
