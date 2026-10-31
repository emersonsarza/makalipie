const entries = new Map<string, Promise<unknown>>();

export const publicCacheKeys = {
  menu: "menu",
  branches: "branches",
  schedule: "schedule",
  shop: "shop",
  popups: "popups",
  stock: "stock",
} as const;

export function stockCacheKey(today: string, horizon: string) {
  return `${publicCacheKeys.stock}:${today}:${horizon}`;
}

/** Production loads once per process. Development reads again so a reseed shows up on refresh. A rejected load is dropped so the next call tries again. */
export function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "development") return Promise.resolve().then(load);
  const hit = entries.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const pending = Promise.resolve().then(load).then(
    (value) => value,
    (error: unknown) => {
      if (entries.get(key) === pending) entries.delete(key);
      throw error;
    },
  );
  entries.set(key, pending);
  return pending;
}

/** Drops an exact key and any key stored under it, such as `stock:2026-10-23`. */
export function forget(...keys: string[]) {
  for (const key of keys) {
    for (const stored of entries.keys()) {
      if (stored === key || stored.startsWith(`${key}:`)) entries.delete(stored);
    }
  }
}
