-- Phase 1 catalog, settings, and owner allowlist.
-- Orders, drops, allocation, numbering, and backups are later phases.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reject_catalog_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'disable this record instead of deleting it';
end;
$$;

create table public.locations (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kind text not null check (kind in ('regular', 'drop')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  address text not null default '' check (char_length(address) <= 300),
  map_url text not null default '' check (map_url = '' or map_url ~ '^https://'),
  hours_label text not null default '' check (char_length(hours_label) <= 150),
  visible boolean not null default false,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  accepting_orders boolean not null default true,
  grab_food_url text not null default '' check (grab_food_url = '' or grab_food_url ~ '^https://'),
  foodpanda_url text not null default '' check (foodpanda_url = '' or foodpanda_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_cebu_stays_visible check (id <> 'cebu' or visible),
  constraint locations_regular_has_fulfillment check (kind = 'drop' or pickup_enabled or delivery_enabled),
  constraint locations_drop_has_no_delivery_apps check (
    kind = 'regular' or (grab_food_url = '' and foodpanda_url = '')
  )
);

create table public.menu_sections (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  note text not null default '' check (char_length(note) <= 200),
  sort_order integer not null,
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  short_description text not null default '' check (char_length(short_description) <= 400),
  description text not null default '' check (char_length(description) <= 2000),
  allergens text[] not null default '{}',
  section_id text not null references public.menu_sections (id) on delete restrict,
  enabled boolean not null default true,
  sort_order integer not null,
  image_path text not null check (image_path ~ '^/images/[A-Za-z0-9_./-]+\.webp$'),
  image_alt text not null check (char_length(btrim(image_alt)) between 1 and 300),
  season_start date,
  season_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_season_is_a_range check (
    (season_start is null and season_end is null)
    or (season_start is not null and season_end is not null and season_start <= season_end)
  )
);

create table public.product_sizes (
  product_id text not null references public.products (id) on delete restrict,
  id text not null check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  price_centavos integer not null check (price_centavos >= 0),
  mode text not null check (mode in ('regular', 'preorder')),
  enabled boolean not null default true,
  sort_order integer not null,
  image_path text check (image_path is null or image_path ~ '^/images/[A-Za-z0-9_./-]+\.webp$'),
  image_alt text check (image_alt is null or char_length(btrim(image_alt)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, id),
  constraint product_sizes_image_pair check (
    (image_path is null and image_alt is null)
    or (image_path is not null and image_alt is not null)
  )
);

create table public.product_theme_images (
  product_id text not null references public.products (id) on delete restrict,
  theme text not null check (theme in ('christmas', 'original')),
  image_path text not null check (image_path ~ '^/images/[A-Za-z0-9_./-]+\.webp$'),
  image_alt text not null check (char_length(btrim(image_alt)) between 1 and 300),
  primary key (product_id, theme)
);

create table public.size_theme_images (
  product_id text not null,
  size_id text not null,
  theme text not null check (theme in ('christmas', 'original')),
  image_path text not null check (image_path ~ '^/images/[A-Za-z0-9_./-]+\.webp$'),
  image_alt text not null check (char_length(btrim(image_alt)) between 1 and 300),
  primary key (product_id, size_id, theme),
  foreign key (product_id, size_id) references public.product_sizes (product_id, id) on delete restrict
);

create table public.size_branch_assignments (
  product_id text not null,
  size_id text not null,
  location_id text not null references public.locations (id) on delete restrict,
  primary key (product_id, size_id, location_id),
  foreign key (product_id, size_id) references public.product_sizes (product_id, id) on delete restrict
);

create table public.add_ons (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  price_centavos integer not null check (price_centavos >= 0),
  icon text not null check (icon in ('gift', 'note', 'default')),
  enabled boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.add_on_locations (
  add_on_id text not null references public.add_ons (id) on delete restrict,
  location_id text not null references public.locations (id) on delete restrict,
  primary key (add_on_id, location_id)
);

create table public.branch_schedules (
  location_id text primary key references public.locations (id) on delete restrict,
  enabled boolean not null default true,
  opens time not null,
  cutoff time not null,
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_schedules_window check (opens < cutoff)
);

create table public.schedule_date_overrides (
  location_id text not null references public.locations (id) on delete restrict,
  service_date date not null,
  closed boolean not null,
  opens time,
  cutoff time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, service_date),
  constraint schedule_overrides_hours check (
    (closed and opens is null and cutoff is null)
    or (not closed and opens is not null and cutoff is not null and opens < cutoff)
  )
);

create table public.shop_settings (
  id integer primary key check (id = 1),
  theme text not null check (theme in ('christmas', 'original')),
  booking_horizon_days integer not null check (booking_horizon_days between 1 and 60),
  preorder_lead_days integer not null check (preorder_lead_days between 0 and 30),
  instagram_url text not null default '' check (instagram_url = '' or instagram_url ~ '^https://'),
  instagram_dm_url text not null default '' check (instagram_dm_url = '' or instagram_dm_url ~ '^https://'),
  messenger_url text not null default '' check (messenger_url = '' or messenger_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.featured_products (
  product_id text primary key references public.products (id) on delete restrict,
  rank integer not null unique check (rank >= 1),
  updated_at timestamptz not null default now()
);

create table public.popups (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  location_id text not null references public.locations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  map_url text not null default '' check (map_url = '' or map_url ~ '^https://'),
  start_date date not null,
  end_date date not null,
  hours text not null check (char_length(btrim(hours)) between 1 and 80),
  items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint popups_dates check (start_date <= end_date)
);

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.login_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null check (char_length(attempt_key) between 1 and 80),
  attempted_at timestamptz not null default now()
);

create index login_attempts_key_time on public.login_attempts (attempt_key, attempted_at desc);

create or replace function public.require_regular_location()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  location_kind text;
begin
  select kind into location_kind from public.locations where id = new.location_id;
  if location_kind is distinct from 'regular' then
    raise exception 'regular branch schedules and size assignments cannot use a drop location';
  end if;
  return new;
end;
$$;

create trigger locations_set_updated_at before update on public.locations
  for each row execute function public.set_updated_at();
create trigger menu_sections_set_updated_at before update on public.menu_sections
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_sizes_set_updated_at before update on public.product_sizes
  for each row execute function public.set_updated_at();
create trigger add_ons_set_updated_at before update on public.add_ons
  for each row execute function public.set_updated_at();
create trigger branch_schedules_set_updated_at before update on public.branch_schedules
  for each row execute function public.set_updated_at();
create trigger schedule_date_overrides_set_updated_at before update on public.schedule_date_overrides
  for each row execute function public.set_updated_at();
create trigger shop_settings_set_updated_at before update on public.shop_settings
  for each row execute function public.set_updated_at();
create trigger featured_products_set_updated_at before update on public.featured_products
  for each row execute function public.set_updated_at();
create trigger popups_set_updated_at before update on public.popups
  for each row execute function public.set_updated_at();

create trigger products_reject_delete before delete on public.products
  for each row execute function public.reject_catalog_delete();
create trigger product_sizes_reject_delete before delete on public.product_sizes
  for each row execute function public.reject_catalog_delete();
create trigger add_ons_reject_delete before delete on public.add_ons
  for each row execute function public.reject_catalog_delete();

create trigger branch_schedules_regular_only before insert or update on public.branch_schedules
  for each row execute function public.require_regular_location();
create trigger schedule_overrides_regular_only before insert or update on public.schedule_date_overrides
  for each row execute function public.require_regular_location();
create trigger size_assignments_regular_only before insert or update on public.size_branch_assignments
  for each row execute function public.require_regular_location();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.reject_catalog_delete() from public, anon, authenticated;
revoke all on function public.require_regular_location() from public, anon, authenticated;

do $grants$
declare
  table_name text;
begin
  for table_name in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end
$grants$;

revoke all on all sequences in schema public from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;
