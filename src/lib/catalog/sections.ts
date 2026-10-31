import { z } from "zod";
import { productIdSchema } from "@/lib/products/schema";

export const menuSectionSchema = z.object({
  id: productIdSchema,
  name: z.string().trim().min(1).max(60),
  note: z.string().trim().max(160),
  sortOrder: z.number().int().min(0).max(9999),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
}).strict();
export type MenuSection = z.infer<typeof menuSectionSchema>;

export function parseMenuSections(data: unknown): MenuSection[] {
  if (data == null) return [];
  if (typeof data !== "object" || !("sections" in data)) throw new Error("Invalid menu sections.");
  const parsed = z.array(menuSectionSchema).max(24).safeParse(data.sections);
  if (!parsed.success) throw new Error("Invalid menu sections.");
  return parsed.data;
}

export function groupBySection<T extends { menuCategoryId?: string | null }>(items: T[], sections: MenuSection[]) {
  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const known = new Set(ordered.map((section) => section.id));
  const groups = ordered
    .map((section) => ({ section, items: items.filter((item) => item.menuCategoryId === section.id) }))
    .filter((group) => group.items.length > 0);
  const unassigned = items.filter((item) => !item.menuCategoryId || !known.has(item.menuCategoryId));
  return { groups, unassigned };
}
