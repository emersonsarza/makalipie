-- Catalog seed for local reset and the hosted sandbox. Safe to run again.
-- No owner password and no customer orders.

insert into public.locations (
  id, kind, name, address, map_url, hours_label, visible,
  pickup_enabled, delivery_enabled, accepting_orders, grab_food_url, foodpanda_url
) values
  (
    'cebu', 'regular', 'Cebu', '2nd Floor, Streetscape, Banilad, Cebu City',
    'https://www.google.com/maps/search/?api=1&query=Streetscape%20Banilad%20Cebu',
    'Daily, 10am to 8pm', true, true, true, true,
    'https://app.grab.com/s/4lIwVCJJ', 'https://foodpanda.go.link/dIyqs'
  ),
  (
    'manila', 'drop', 'Manila', '', '', '', false, true, false, false, '', ''
  )
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  address = excluded.address,
  map_url = excluded.map_url,
  hours_label = excluded.hours_label,
  visible = excluded.visible,
  pickup_enabled = excluded.pickup_enabled,
  delivery_enabled = excluded.delivery_enabled,
  accepting_orders = excluded.accepting_orders,
  grab_food_url = excluded.grab_food_url,
  foodpanda_url = excluded.foodpanda_url;

insert into public.menu_sections (id, name, note, sort_order, weekdays) values
  ('classic-flavors', 'Classic flavors', '', 0, '{0,1,2,3,4,5,6}'),
  ('weekend-specials', 'Weekend specials', 'Friday to Sunday', 1, '{5,6,0}'),
  ('october-special', 'Seasonal favorites', '', 2, '{5,6,0}')
on conflict (id) do update set
  name = excluded.name,
  note = excluded.note,
  sort_order = excluded.sort_order,
  weekdays = excluded.weekdays;

insert into public.products (
  id, name, short_description, description, allergens, section_id, enabled, sort_order,
  image_path, image_alt, season_start, season_end
) values
  (
    'keylime', 'Keylime',
    'Tart, sunny, and a little tropical. A squeeze of sunshine in a flaky shell.',
    'A zesty, tangy delight with a smooth lime filling on a graham crust, finished with a dollop of whipped cream. Refreshingly irresistible.',
    '{}', 'classic-flavors', true, 0,
    '/images/brand/keylime.webp', 'A Keylime tart with graham crust, creamy lime filling, and whipped cream',
    null, null
  ),
  (
    'pecan', 'Pecan',
    'Toasty pecans, caramel-deep sweetness, and that crackly top we all fight over.',
    'A decadent mix of buttery caramel and toasted pecans on our signature all butter shortcrust.',
    '{}', 'classic-flavors', true, 1,
    '/images/brand/pecan.webp', 'A whole pecan tart with a golden fluted crust and glossy toasted pecans',
    null, null
  ),
  (
    'banoffee', 'Banoffee',
    'Banana, toffee, cream. The kind of slice that makes people close their eyes.',
    'A heavenly blend of bananas and creamy caramel, topped with whipped cream for a classic indulgence.',
    '{}', 'classic-flavors', true, 2,
    '/images/brand/banoffee.webp', 'A slice of Banoffee tart with banana, caramel, and cream',
    null, null
  ),
  (
    'smores', 'S’mores',
    'Campfire nostalgia: toasted marshmallow, chocolate, and a graham-kissed crust.',
    'A rich chocolate ganache topped with graham and gooey marshmallows for the ultimate treat.',
    '{}', 'classic-flavors', true, 3,
    '/images/brand/smores.webp', 'Close-up of a chocolate tart topped with toasted marshmallow',
    null, null
  ),
  (
    'oreo', 'Oreo',
    'Cookies-and-cream comfort, piled into our handcrafted crust.',
    'A rich and creamy Oreo-infused white chocolate ganache with layers of crushed cookies, a true crowd-pleaser.',
    '{}', 'classic-flavors', true, 4,
    '/images/brand/oreo.webp', 'Oreo tart slices with cookies-and-cream filling',
    null, null
  ),
  (
    'apple', 'Apple',
    'Spiced apple and a buttery oat crumble in our handcrafted crust.',
    'A warm apple filling under a golden oat crumble, baked in our handcrafted crust.',
    '{}', 'weekend-specials', true, 5,
    '/images/brand/apple.webp', 'An apple tart with oat crumble and caramel on a gold board',
    null, null
  ),
  (
    'buko', 'Buko',
    'Young coconut, creamy filling, and the crust that started all the DMs.',
    'Our bestseller: young coconut cream in a handcrafted crust. Available Friday to Sunday. Message us to secure a pie.',
    '{}', 'weekend-specials', true, 6,
    '/images/brand/buko.webp', 'A young coconut cream tart with a red flower on a gold board',
    null, null
  ),
  (
    'butter-chicken-curry', 'Butter Chicken Curry',
    'Slow, saucy, and wrapped in that one-of-a-kind flaky crust. A little savoury comfort.',
    'Homemade Indian butter chicken curry in our French all-butter flaky crust. Ask us about the current batch at Streetscape.',
    '{}', 'weekend-specials', true, 7,
    '/images/brand/butter-chicken.webp', 'A flaky Butter Chicken Curry pie broken open to show the chicken filling',
    null, null
  ),
  (
    'pumpkin-spice', 'Pumpkin Spice',
    'Warm pumpkin filling, cream, and a leaf cookie.',
    'Smooth pumpkin filling finished with cream and a leaf cookie.',
    '{}', 'october-special', true, 8,
    '/images/brand/pumpkin-spice.webp', 'A small pumpkin tart with cream and a leaf cookie on a gold board',
    '2027-10-01', '2027-10-31'
  )
on conflict (id) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  description = excluded.description,
  allergens = excluded.allergens,
  section_id = excluded.section_id,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  image_path = excluded.image_path,
  image_alt = excluded.image_alt,
  season_start = excluded.season_start,
  season_end = excluded.season_end;

insert into public.product_sizes (
  product_id, id, label, price_centavos, mode, enabled, sort_order, image_path, image_alt
) values
  ('keylime', '4-inch', '4"', 24000, 'regular', true, 0, null, null),
  ('keylime', '10-inch', '10"', 250000, 'preorder', true, 1, '/images/brand/keylime-10.webp', 'A large Keylime tart with graham crust, creamy lime filling, and whipped cream'),
  ('pecan', '4-inch', '4"', 24000, 'regular', true, 0, null, null),
  ('pecan', '10-inch', '10"', 250000, 'preorder', true, 1, '/images/brand/pecan-10.webp', 'A large pecan tart with a golden fluted crust and glossy toasted pecans'),
  ('banoffee', '4-inch', '4"', 24000, 'regular', true, 0, null, null),
  ('banoffee', '10-inch', '10"', 250000, 'preorder', true, 1, '/images/brand/banoffee-10.webp', 'A large Banoffee tart with banana, caramel, and cream'),
  ('smores', '4-inch', '4"', 19000, 'regular', true, 0, null, null),
  ('smores', '10-inch', '10"', 190000, 'preorder', true, 1, '/images/brand/smores-10.webp', 'A large chocolate tart topped with toasted marshmallow'),
  ('oreo', '4-inch', '4"', 19000, 'regular', true, 0, null, null),
  ('oreo', '10-inch', '10"', 190000, 'preorder', true, 1, '/images/brand/oreo-10.webp', 'A large Oreo tart with cookies-and-cream filling'),
  ('apple', '4-inch', '4"', 28000, 'regular', true, 0, null, null),
  ('apple', '10-inch', '10"', 280000, 'preorder', true, 1, '/images/brand/apple-10.webp', 'A large apple tart with oat crumble and caramel'),
  ('buko', '4-inch', '4"', 28000, 'regular', true, 0, null, null),
  ('buko', '10-inch', '10"', 190000, 'preorder', true, 1, '/images/brand/buko-10.webp', 'A large young coconut cream tart'),
  ('butter-chicken-curry', '4-inch', '4"', 30000, 'regular', true, 0, null, null),
  ('pumpkin-spice', '4-inch', '4"', 26000, 'regular', true, 0, null, null),
  ('pumpkin-spice', '10-inch', '10"', 260000, 'preorder', true, 1, '/images/brand/pumpkin-spice-10.webp', 'A large pumpkin tart with a whipped-cream border and leaf cookies on a white board')
on conflict (product_id, id) do update set
  label = excluded.label,
  price_centavos = excluded.price_centavos,
  mode = excluded.mode,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  image_path = excluded.image_path,
  image_alt = excluded.image_alt;

insert into public.product_theme_images (product_id, theme, image_path, image_alt) values
  ('keylime', 'christmas', '/images/christmas/keylime.webp', 'Keylime tart with its original cream swirl and lime zest in a subtly festive setting'),
  ('pecan', 'christmas', '/images/christmas/pecan.webp', 'Pecan tarts with their original caramel and nut topping in a subtly festive setting'),
  ('banoffee', 'christmas', '/images/christmas/banoffee.webp', 'Banoffee tart with banana, caramel, cream and chocolate shavings in a subtly festive setting'),
  ('smores', 'christmas', '/images/christmas/smores.webp', 'S’mores tart with three toasted marshmallows in a subtly festive setting'),
  ('oreo', 'christmas', '/images/christmas/oreo.webp', 'Oreo tart slices with cookies-and-cream filling in a subtly festive setting'),
  ('apple', 'christmas', '/images/christmas/apple.webp', 'Apple crumble pie on a wooden board in a Christmas setting'),
  ('buko', 'christmas', '/images/christmas/buko.webp', 'Buko pie with coconut filling and a red flower on a wooden board in a Christmas setting'),
  ('butter-chicken-curry', 'christmas', '/images/christmas/butter-chicken.webp', 'A Butter Chicken Curry pie opened by hand to show its filling, with a subtly festive background'),
  ('pumpkin-spice', 'christmas', '/images/christmas/pumpkin-spice.webp', 'A slice of Pumpkin Spice tart with cream and a leaf cookie in a Christmas setting')
on conflict (product_id, theme) do update set
  image_path = excluded.image_path,
  image_alt = excluded.image_alt;

insert into public.size_theme_images (product_id, size_id, theme, image_path, image_alt)
select product_id, '4-inch', theme, image_path, image_alt
from public.product_theme_images
on conflict (product_id, size_id, theme) do update set
  image_path = excluded.image_path,
  image_alt = excluded.image_alt;

insert into public.size_branch_assignments (product_id, size_id, location_id)
select product_id, id, 'cebu' from public.product_sizes
on conflict (product_id, size_id, location_id) do nothing;

insert into public.add_ons (id, name, price_centavos, icon, enabled, sort_order) values
  ('birthday-topper', 'Birthday Topper', 800, 'gift', true, 0),
  ('note-card', 'Note Card With Ribbon', 1500, 'note', true, 1)
on conflict (id) do update set
  name = excluded.name,
  price_centavos = excluded.price_centavos,
  icon = excluded.icon,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order;

insert into public.add_on_locations (add_on_id, location_id) values
  ('birthday-topper', 'cebu'),
  ('note-card', 'cebu')
on conflict (add_on_id, location_id) do nothing;

insert into public.branch_schedules (location_id, enabled, opens, cutoff, weekdays) values
  ('cebu', true, '10:00', '19:00', '{0,1,2,3,4,5,6}')
on conflict (location_id) do update set
  enabled = excluded.enabled,
  opens = excluded.opens,
  cutoff = excluded.cutoff,
  weekdays = excluded.weekdays;

insert into public.shop_settings (
  id, theme, booking_horizon_days, preorder_lead_days, instagram_url, instagram_dm_url, messenger_url
) values (
  1, 'christmas', 7, 3,
  'https://www.instagram.com/makalipie/',
  'https://ig.me/m/makalipie',
  ''
)
on conflict (id) do update set
  theme = excluded.theme,
  booking_horizon_days = excluded.booking_horizon_days,
  preorder_lead_days = excluded.preorder_lead_days,
  instagram_url = excluded.instagram_url,
  instagram_dm_url = excluded.instagram_dm_url,
  messenger_url = excluded.messenger_url;

insert into public.featured_products (product_id, rank) values
  ('buko', 1),
  ('smores', 2),
  ('pecan', 3),
  ('keylime', 4)
on conflict (product_id) do update set rank = excluded.rank;

insert into public.popups (
  id, location_id, name, address, map_url, start_date, end_date, hours, items
) values (
  'sunday-market',
  'cebu',
  'Sunday Market',
  'Mindanao Avenue, Cebu Business Park, Cebu City',
  'https://www.google.com/maps/dir/?api=1&destination=Cebu+Sunday+Market+Mindanao+Avenue+Cebu+Business+Park+Cebu+City',
  '2026-11-15',
  '2026-11-15',
  '7am–3pm',
  array['Butter Chicken Curry']
)
on conflict (id) do update set
  location_id = excluded.location_id,
  name = excluded.name,
  address = excluded.address,
  map_url = excluded.map_url,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  hours = excluded.hours,
  items = excluded.items;
