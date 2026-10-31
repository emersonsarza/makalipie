import { emulatorEnv } from "./emulator-env.mjs";

Object.assign(process.env, emulatorEnv);

async function main() {
  const { importProducts } = await import("../src/lib/products/store");
  const { initializeCatalog, readCatalog } = await import("../src/lib/catalog/store");
  const { defaultBranchSettings } = await import("../src/lib/branches/schema");
  const { readBranchSettings, saveBranchSettings } = await import("../src/lib/branches/store");
  const { defaultScheduleSettings } = await import("../src/lib/scheduling/schema");
  const { readScheduleSettings, saveScheduleSettings } = await import("../src/lib/scheduling/store");
  const { defaultShopSettings } = await import("../src/lib/settings/schema");
  const { getServerFirebase } = await import("../src/lib/firebase/server");
  const { readOrderingAvailability } = await import("../src/lib/orders/store");
  const uid = "order-demo";

  await importProducts(uid);
  await initializeCatalog(uid);
  const catalog = await readCatalog();
  const branches = defaultBranchSettings();
  const storedBranches = await readBranchSettings();
  branches.version = storedBranches.version;
  branches.branches = [
    {
      id: "cebu",
      name: "Cebu",
      address: "2nd Floor, Streetscape, Banilad, Cebu City",
      visible: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      mapUrl: "https://www.google.com/maps/search/?api=1&query=Streetscape%20Banilad%20Cebu",
      hoursLabel: "Daily, 10am to 8pm",
      customerLimit: null,
      areas: ["Banilad", "IT Park", "Lahug"],
    },
    {
      id: "manila",
      name: "Manila",
      address: "Makati, Metro Manila",
      visible: false,
      deliveryEnabled: true,
      pickupEnabled: true,
      mapUrl: "",
      hoursLabel: "Daily, 10am to 8pm",
      customerLimit: null,
      areas: ["Makati", "BGC"],
    },
  ];
  branches.assignments = catalog.products.flatMap((product) => product.variants.filter((variant) => variant.active).map((variant) => ({
    productId: product.id,
    variantId: variant.id,
    branchIds: ["cebu", "manila"] as ("cebu" | "manila")[],
    mode: variant.minLeadDays > 0 ? "preorder" as const : "regular" as const,
  })));
  await saveBranchSettings(branches, uid);

  const schedule = defaultScheduleSettings();
  const storedSchedule = await readScheduleSettings();
  schedule.version = storedSchedule.version;
  schedule.bookingHorizonDays = 14;
  for (const branchId of ["cebu", "manila"] as const) {
    schedule.branches[branchId] = {
      enabled: true,
      startTime: "10:00",
      cutoffTime: "20:00",
      openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      closedDates: [],
    };
  }
  await saveScheduleSettings(schedule, uid);
  await getServerFirebase().db.doc("settings/shop").set({ ...defaultShopSettings, updatedBy: uid, updatedAt: new Date().toISOString() });

  const availability = await readOrderingAvailability();
  const cebuDates = availability.openDates.cebu ?? [];
  console.log(`Demo order data ready. Cebu has ${cebuDates.length} open dates, first ${cebuDates[0] ?? "none"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("Start the Auth and Firestore emulators before seeding.");
  process.exitCode = 1;
});
