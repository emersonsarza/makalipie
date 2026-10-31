import { z } from "zod";
import { featuredMenuSlugs, site } from "@/lib/site";
const link = z.union([z.literal(""), z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS link.")]);
export const shopSettingsSchema = z.object({
  links: z.object({ instagram: link.default(site.instagramUrl), instagramDm: link.default(site.instagramDmUrl), messenger: link.default(""), grabFood: link.default(site.grabUrl), foodpanda: link.default(site.foodpandaUrl) }).default({ instagram: site.instagramUrl, instagramDm: site.instagramDmUrl, messenger: "", grabFood: site.grabUrl, foodpanda: site.foodpandaUrl }),
  // Missing documents still parse. Preparation and completion enforce full payment even when this flag is false. New customer editing follows the stored default, which is off.
  requireFullPaymentDefault: z.boolean().default(false), customerEditDefault: z.boolean().default(false),
  holdMinutes: z.number().int().min(1).max(1440).default(30), confirmBeforeSlotMinutes: z.number().int().min(0).max(1440).default(60),
  defaultPreorderLeadDays: z.number().int().min(0).max(365).default(3),
  featuredProductIds: z.array(z.string().trim().min(1).max(80)).max(24).default([...featuredMenuSlugs]),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;
export const defaultShopSettings = shopSettingsSchema.parse({});
export type PublicShop = { links: ShopSettings["links"]; branchName: string; address: string; hoursLabel: string; mapUrl: string; deliveryAvailable: boolean; defaultPreorderLeadDays: number; featuredProductIds: string[] };
export const defaultPublicShop: PublicShop = { links: defaultShopSettings.links, branchName: "Makalipie Cebu", address: "2nd Floor, Streetscape, Banilad, Cebu City", hoursLabel: "Daily, 10am to 8pm", mapUrl: site.mapsUrl, deliveryAvailable: true, defaultPreorderLeadDays: defaultShopSettings.defaultPreorderLeadDays, featuredProductIds: defaultShopSettings.featuredProductIds };
