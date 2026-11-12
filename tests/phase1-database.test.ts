import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "../src/lib/admin/env";
import { createServiceClient } from "../src/lib/admin/supabase";

const env = readSupabaseEnv();
const service = createServiceClient();
const publishable = createClient(env.url, env.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const tables = [
  "locations", "menu_sections", "products", "product_sizes", "product_theme_images", "size_theme_images",
  "size_branch_assignments", "add_ons", "add_on_locations", "branch_schedules", "schedule_date_overrides",
  "shop_settings", "featured_products", "popups", "admin_users", "login_attempts",
  "storefront_revision", "storefront_snapshot",
  "drop_revision", "drop_snapshot", "drops", "drop_dates", "drop_offerings",
  "drop_package_components", "drop_offering_dates", "drop_addons",
  "daily_order_sequences", "orders", "order_lines", "order_line_components", "order_addons", "order_idempotency",
  "backup_keys",
];

test("seed matches the phase 1 catalog", async () => {
  const settings = await service.from("shop_settings").select("theme, booking_horizon_days, preorder_lead_days, instagram_url, instagram_dm_url, messenger_url").single();
  assert.equal(settings.error, null);
  assert.equal(settings.data.theme, "christmas");
  assert.equal(settings.data.booking_horizon_days, 7);
  assert.equal(settings.data.preorder_lead_days, 3);
  assert.equal(settings.data.instagram_url, "https://www.instagram.com/makalipie/");
  assert.equal(settings.data.instagram_dm_url, "https://ig.me/m/makalipie");
  assert.equal(settings.data.messenger_url, "");

  const cebu = await service.from("locations").select("kind, visible, hours_label, pickup_enabled, delivery_enabled, accepting_orders, grab_food_url, foodpanda_url").eq("id", "cebu").single();
  assert.equal(cebu.error, null);
  assert.equal(cebu.data.kind, "regular");
  assert.equal(cebu.data.visible, true);
  assert.equal(cebu.data.hours_label, "Daily, 10am to 8pm");
  assert.equal(cebu.data.pickup_enabled, true);
  assert.equal(cebu.data.delivery_enabled, true);
  assert.equal(cebu.data.accepting_orders, true);
  assert.equal(cebu.data.grab_food_url, "https://app.grab.com/s/4lIwVCJJ");
  assert.equal(cebu.data.foodpanda_url, "https://foodpanda.go.link/dIyqs");

  const manila = await service.from("locations").select("kind, visible, grab_food_url, foodpanda_url").eq("id", "manila").single();
  assert.equal(manila.error, null);
  assert.equal(manila.data.kind, "drop");
  assert.equal(manila.data.visible, false);
  assert.equal(manila.data.grab_food_url, "");
  assert.equal(manila.data.foodpanda_url, "");

  const schedule = await service.from("branch_schedules").select("enabled, opens, cutoff, weekdays").eq("location_id", "cebu").single();
  assert.equal(schedule.error, null);
  assert.equal(schedule.data.enabled, true);
  assert.equal(String(schedule.data.opens).slice(0, 5), "10:00");
  assert.equal(String(schedule.data.cutoff).slice(0, 5), "19:00");
  assert.deepEqual(schedule.data.weekdays, [0, 1, 2, 3, 4, 5, 6]);

  const weekend = await service.from("menu_sections").select("name, note, weekdays").eq("id", "weekend-specials").single();
  assert.equal(weekend.data?.name, "Weekend specials");
  assert.equal(weekend.data?.note, "Friday to Sunday");
  assert.deepEqual(weekend.data?.weekdays, [5, 6, 0]);
  const seasonal = await service.from("menu_sections").select("name").eq("id", "october-special").single();
  assert.equal(seasonal.data?.name, "Seasonal favorites");

  const pumpkin = await service.from("products").select("season_start, season_end, section_id").eq("id", "pumpkin-spice").single();
  assert.equal(pumpkin.data?.season_start, "2027-10-01");
  assert.equal(pumpkin.data?.season_end, "2027-10-31");
  assert.equal(pumpkin.data?.section_id, "october-special");
  const plain = await service.from("products").select("season_start, season_end").eq("id", "keylime").single();
  assert.equal(plain.data?.season_start, null);
  assert.equal(plain.data?.season_end, null);

  const keylimeSizes = await service.from("product_sizes").select("id, price_centavos, mode, image_path").eq("product_id", "keylime").order("sort_order");
  assert.deepEqual(keylimeSizes.data, [
    { id: "4-inch", price_centavos: 24000, mode: "regular", image_path: null },
    { id: "10-inch", price_centavos: 250000, mode: "preorder", image_path: "/images/brand/keylime-10.webp" },
  ]);
  const savory = await service.from("product_sizes").select("id").eq("product_id", "butter-chicken-curry");
  assert.deepEqual(savory.data, [{ id: "4-inch" }]);

  const theme = await service.from("product_theme_images").select("image_path").eq("product_id", "keylime").eq("theme", "christmas").single();
  assert.equal(theme.data?.image_path, "/images/christmas/keylime.webp");
  const fourInchTheme = await service.from("size_theme_images").select("image_path").eq("product_id", "keylime").eq("size_id", "4-inch").eq("theme", "christmas").single();
  assert.equal(fourInchTheme.data?.image_path, "/images/christmas/keylime.webp");
  const tenInchTheme = await service.from("size_theme_images").select("image_path").eq("product_id", "keylime").eq("size_id", "10-inch");
  assert.deepEqual(tenInchTheme.data, []);

  const addons = await service.from("add_ons").select("id, price_centavos, icon").order("sort_order");
  assert.deepEqual(addons.data, [
    { id: "birthday-topper", price_centavos: 800, icon: "gift" },
    { id: "note-card", price_centavos: 1500, icon: "note" },
  ]);
  assert.equal("customization" in (addons.data?.[0] ?? {}), false);
  const addonLocations = await service.from("add_on_locations").select("add_on_id, location_id").order("add_on_id");
  assert.deepEqual(addonLocations.data, [
    { add_on_id: "birthday-topper", location_id: "cebu" },
    { add_on_id: "note-card", location_id: "cebu" },
  ]);

  const featured = await service.from("featured_products").select("product_id").order("rank");
  assert.deepEqual(featured.data?.map((row) => row.product_id), ["buko", "smores", "pecan", "keylime"]);

  const popup = await service.from("popups").select("location_id, start_date, end_date, hours, items").eq("id", "sunday-market").single();
  assert.equal(popup.data?.location_id, "cebu");
  assert.equal(popup.data?.start_date, "2026-11-15");
  assert.equal(popup.data?.end_date, "2026-11-15");
  assert.equal(popup.data?.hours, "7am–3pm");
  assert.deepEqual(popup.data?.items, ["Butter Chicken Curry"]);

  const overrides = await service.from("schedule_date_overrides").select("service_date", { count: "exact", head: true });
  assert.equal(overrides.count, 0);

  const paths = [
    ...(await service.from("products").select("image_path")).data?.map((row) => row.image_path) ?? [],
    ...(await service.from("product_sizes").select("image_path")).data?.flatMap((row) => row.image_path ? [row.image_path] : []) ?? [],
    ...(await service.from("product_theme_images").select("image_path")).data?.map((row) => row.image_path) ?? [],
    ...(await service.from("size_theme_images").select("image_path")).data?.map((row) => row.image_path) ?? [],
  ];
  assert.ok(paths.length > 0);
  for (const imagePath of paths) {
    assert.equal(existsSync(join(process.cwd(), "public", imagePath.replace(/^\//, ""))), true, imagePath);
  }
});

test("publishable key cannot read application tables", async () => {
  for (const table of tables) {
    const result = await publishable.from(table).select("*").limit(1);
    assert.ok(result.error, table);
    assert.match(result.error.message, /permission denied|row-level security/i);
  }
});

test("Cebu cannot be hidden and catalog rows cannot be deleted", async () => {
  const hidden = await service.from("locations").update({ visible: false }).eq("id", "cebu").select("id");
  assert.ok(hidden.error);
  const removed = await service.from("products").delete().eq("id", "keylime");
  assert.ok(removed.error);
  const stillThere = await service.from("products").select("id").eq("id", "keylime").single();
  assert.equal(stillThere.data?.id, "keylime");
});
