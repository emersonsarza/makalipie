import { z } from "zod";
import { site } from "@/lib/site";
const link = z.union([z.literal(""), z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS link.")]);
export const shopSettingsSchema = z.object({
  links: z.object({ instagram: link.default(site.instagramUrl), instagramDm: link.default(site.instagramDmUrl), messenger: link.default(""), grabFood: link.default(site.grabUrl), foodpanda: link.default(site.foodpandaUrl) }).default({ instagram: site.instagramUrl, instagramDm: site.instagramDmUrl, messenger: "", grabFood: site.grabUrl, foodpanda: site.foodpandaUrl }),
  // Q3/Q4: temporary defaults from the implementation brief, not settled policy.
  requireFullPaymentDefault: z.boolean().default(false), customerEditDefault: z.boolean().default(false),
  holdMinutes: z.number().int().min(1).max(1440).default(30), confirmBeforeSlotMinutes: z.number().int().min(0).max(1440).default(60),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;
export const defaultShopSettings = shopSettingsSchema.parse({});
export type PublicShop = { links: ShopSettings["links"]; branchName: string; address: string; hoursLabel: string; mapUrl: string; deliveryAvailable: boolean };
export const defaultPublicShop: PublicShop = { links: defaultShopSettings.links, branchName: "Makalipie Cebu Main", address: "2nd Floor, Streetscape, Banilad, Cebu City", hoursLabel: "Daily, 10am to 8pm", mapUrl: site.mapsUrl, deliveryAvailable: true };
