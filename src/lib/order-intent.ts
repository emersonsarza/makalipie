import type { MenuItem } from "@/lib/site";

export function orderProductHref(item: Pick<MenuItem, "slug" | "variants">): string {
  const params = new URLSearchParams({ product: item.slug });
  if (item.variants?.length === 1) params.set("size", item.variants[0].id);
  return `/order?${params}`;
}

export function preorderMenuHref(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(entry => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  }
  query.set("view", "preorders");
  return `/menu?${query}`;
}
