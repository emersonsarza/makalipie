import { seedBranchSettings, seedPopups, seedSchedule, seedShop } from "@/lib/catalog/seed-data";
import { defaultCatalog } from "@/lib/catalog/defaults";
import { branchSettingsSchema, type BranchSettings } from "@/lib/branches/schema";
import { presentMenu } from "@/lib/products/present";
import { popupSettingsSchema, type PopupSettings } from "@/lib/popups/schema";
import { scheduleSettingsSchema, type ScheduleSettings } from "@/lib/scheduling/schema";
import type { PublicShop } from "@/lib/settings/schema";

export function staticBranchSettings(): BranchSettings {
  return branchSettingsSchema.parse(seedBranchSettings);
}

export function staticSchedule(): ScheduleSettings {
  return scheduleSettingsSchema.parse(seedSchedule);
}

export function staticPopups(): PopupSettings {
  return popupSettingsSchema.parse(seedPopups);
}

export function staticPublicShop(): PublicShop {
  const branches = staticBranchSettings();
  const branch = branches.branches.find((item) => item.id === branches.defaultBranch);
  return {
    links: { ...seedShop.links },
    branchName: branch?.name || "Cebu",
    address: branch?.address || "",
    hoursLabel: branch?.hoursLabel || "",
    mapUrl: branch?.mapUrl || "",
    deliveryAvailable: branches.branches.some((item) => item.visible && item.deliveryEnabled),
    defaultPreorderLeadDays: seedShop.defaultPreorderLeadDays,
    featuredProductIds: [...seedShop.featuredProductIds],
  };
}

export function staticPublicMenu() {
  return presentMenu(defaultCatalog());
}
