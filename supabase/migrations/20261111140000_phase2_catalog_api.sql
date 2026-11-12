-- Phase 2 catalog writes and the shared storefront snapshot.
-- Date changes report no affected orders until the orders phase exists.

create table public.storefront_revision (
  id integer primary key check (id = 1),
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default now()
);

insert into public.storefront_revision (id, revision) values (1, 1);

create table public.storefront_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null,
  payload jsonb not null,
  stored_at timestamptz not null default now()
);

create or replace function public.jsonb_texts(value jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(item), '{}'::text[])
  from jsonb_array_elements_text(coalesce(value, '[]'::jsonb)) as item;
$$;

create or replace function public.jsonb_smallints(value jsonb)
returns smallint[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(item::smallint), '{}'::smallint[])
  from jsonb_array_elements_text(coalesce(value, '[]'::jsonb)) as item;
$$;

create or replace function public.catalog_save_location(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lid text := payload->>'id';
  existing timestamptz;
  current_kind text;
  next_kind text := payload->>'kind';
begin
  if payload ? 'updatedAt' then
    select updated_at, kind into existing, current_kind from public.locations where id = lid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    if current_kind is distinct from next_kind then raise exception 'validation'; end if;
    update public.locations set
      name = payload->>'name',
      address = coalesce(payload->>'address', ''),
      map_url = coalesce(payload->>'mapUrl', ''),
      hours_label = coalesce(payload->>'hoursLabel', ''),
      visible = (payload->>'visible')::boolean,
      pickup_enabled = (payload->>'pickupEnabled')::boolean,
      delivery_enabled = (payload->>'deliveryEnabled')::boolean,
      accepting_orders = (payload->>'acceptingOrders')::boolean,
      grab_food_url = coalesce(payload->>'grabFoodUrl', ''),
      foodpanda_url = coalesce(payload->>'foodpandaUrl', '')
    where id = lid;
  else
    insert into public.locations (
      id, kind, name, address, map_url, hours_label, visible,
      pickup_enabled, delivery_enabled, accepting_orders, grab_food_url, foodpanda_url
    ) values (
      lid, next_kind, payload->>'name', coalesce(payload->>'address', ''),
      coalesce(payload->>'mapUrl', ''), coalesce(payload->>'hoursLabel', ''),
      coalesce((payload->>'visible')::boolean, false),
      coalesce((payload->>'pickupEnabled')::boolean, true),
      coalesce((payload->>'deliveryEnabled')::boolean, false),
      coalesce((payload->>'acceptingOrders')::boolean, true),
      coalesce(payload->>'grabFoodUrl', ''), coalesce(payload->>'foodpandaUrl', '')
    );
    if next_kind = 'regular' then
      insert into public.branch_schedules (location_id, enabled, opens, cutoff, weekdays)
      values (lid, true, time '10:00', time '19:00', array[0, 1, 2, 3, 4, 5, 6]::smallint[]);
    end if;
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_section(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text := payload->>'id';
  existing timestamptz;
begin
  if payload ? 'updatedAt' then
    select updated_at into existing from public.menu_sections where id = sid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.menu_sections set
      name = payload->>'name',
      note = coalesce(payload->>'note', ''),
      sort_order = (payload->>'sortOrder')::integer,
      weekdays = public.jsonb_smallints(payload->'weekdays')
    where id = sid;
  else
    insert into public.menu_sections (id, name, note, sort_order, weekdays)
    values (sid, payload->>'name', coalesce(payload->>'note', ''), (payload->>'sortOrder')::integer, public.jsonb_smallints(payload->'weekdays'));
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_delete_section(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text := payload->>'id';
  existing timestamptz;
begin
  select updated_at into existing from public.menu_sections where id = sid for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  if exists (select 1 from public.products where section_id = sid) then
    raise exception 'section_in_use';
  end if;
  delete from public.menu_sections where id = sid;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_reorder_sections(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  position integer := 0;
  existing timestamptz;
begin
  for item in select value from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
  loop
    select updated_at into existing from public.menu_sections where id = item->>'id' for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (item->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.menu_sections set sort_order = position where id = item->>'id';
    position := position + 1;
  end loop;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_reorder_products(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  position integer := 0;
  existing timestamptz;
begin
  for item in select value from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
  loop
    select updated_at into existing from public.products
      where id = item->>'id' and section_id = payload->>'sectionId'
      for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (item->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.products set sort_order = position where id = item->>'id';
    position := position + 1;
  end loop;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_product(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pid text := payload->>'id';
  existing timestamptz;
  size_row jsonb;
  theme_row jsonb;
  branch_id text;
begin
  if payload ? 'updatedAt' then
    select updated_at into existing from public.products where id = pid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.products set
      name = payload->>'name',
      short_description = coalesce(payload->>'shortDescription', ''),
      description = coalesce(payload->>'description', ''),
      allergens = public.jsonb_texts(payload->'allergens'),
      section_id = payload->>'sectionId',
      enabled = (payload->>'enabled')::boolean,
      sort_order = (payload->>'sortOrder')::integer,
      image_path = payload->>'imagePath',
      image_alt = payload->>'imageAlt',
      season_start = nullif(payload->>'seasonStart', '')::date,
      season_end = nullif(payload->>'seasonEnd', '')::date
    where id = pid;
  else
    insert into public.products (
      id, name, short_description, description, allergens, section_id, enabled, sort_order,
      image_path, image_alt, season_start, season_end
    ) values (
      pid, payload->>'name', coalesce(payload->>'shortDescription', ''), coalesce(payload->>'description', ''),
      public.jsonb_texts(payload->'allergens'), payload->>'sectionId', (payload->>'enabled')::boolean,
      (payload->>'sortOrder')::integer, payload->>'imagePath', payload->>'imageAlt',
      nullif(payload->>'seasonStart', '')::date, nullif(payload->>'seasonEnd', '')::date
    );
  end if;

  update public.product_sizes set enabled = false
  where product_id = pid
    and not exists (
      select 1 from jsonb_array_elements(coalesce(payload->'sizes', '[]'::jsonb)) as listed
      where listed->>'id' = product_sizes.id
    );

  for size_row in select value from jsonb_array_elements(coalesce(payload->'sizes', '[]'::jsonb))
  loop
    insert into public.product_sizes (
      product_id, id, label, price_centavos, mode, enabled, sort_order, image_path, image_alt
    ) values (
      pid, size_row->>'id', size_row->>'label', (size_row->>'priceCentavos')::integer, size_row->>'mode',
      (size_row->>'enabled')::boolean, (size_row->>'sortOrder')::integer,
      nullif(size_row->>'imagePath', ''), nullif(size_row->>'imageAlt', '')
    )
    on conflict (product_id, id) do update set
      label = excluded.label,
      price_centavos = excluded.price_centavos,
      mode = excluded.mode,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      image_path = excluded.image_path,
      image_alt = excluded.image_alt;

    delete from public.size_theme_images where product_id = pid and size_id = size_row->>'id';
    for theme_row in select value from jsonb_array_elements(coalesce(size_row->'themeImages', '[]'::jsonb))
    loop
      insert into public.size_theme_images (product_id, size_id, theme, image_path, image_alt)
      values (pid, size_row->>'id', theme_row->>'theme', theme_row->>'path', theme_row->>'alt');
    end loop;

    delete from public.size_branch_assignments where product_id = pid and size_id = size_row->>'id';
    for branch_id in select value from jsonb_array_elements_text(coalesce(size_row->'branchIds', '[]'::jsonb))
    loop
      insert into public.size_branch_assignments (product_id, size_id, location_id)
      values (pid, size_row->>'id', branch_id);
    end loop;
  end loop;

  delete from public.product_theme_images where product_id = pid;
  for theme_row in select value from jsonb_array_elements(coalesce(payload->'themeImages', '[]'::jsonb))
  loop
    insert into public.product_theme_images (product_id, theme, image_path, image_alt)
    values (pid, theme_row->>'theme', theme_row->>'path', theme_row->>'alt');
  end loop;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_addon(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  aid text := payload->>'id';
  existing timestamptz;
  branch_id text;
begin
  if payload ? 'updatedAt' then
    select updated_at into existing from public.add_ons where id = aid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.add_ons set
      name = payload->>'name',
      price_centavos = (payload->>'priceCentavos')::integer,
      icon = payload->>'icon',
      enabled = (payload->>'enabled')::boolean,
      sort_order = (payload->>'sortOrder')::integer
    where id = aid;
  else
    insert into public.add_ons (id, name, price_centavos, icon, enabled, sort_order)
    values (
      aid, payload->>'name', (payload->>'priceCentavos')::integer, payload->>'icon',
      (payload->>'enabled')::boolean, (payload->>'sortOrder')::integer
    );
  end if;
  delete from public.add_on_locations where add_on_id = aid;
  for branch_id in select value from jsonb_array_elements_text(coalesce(payload->'locationIds', '[]'::jsonb))
  loop
    insert into public.add_on_locations (add_on_id, location_id) values (aid, branch_id);
  end loop;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_schedule(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing timestamptz;
begin
  select updated_at into existing from public.branch_schedules where location_id = payload->>'locationId' for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  update public.branch_schedules set
    enabled = (payload->>'enabled')::boolean,
    opens = (payload->>'opens')::time,
    cutoff = (payload->>'cutoff')::time,
    weekdays = public.jsonb_smallints(payload->'weekdays')
  where location_id = payload->>'locationId';
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_override(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing timestamptz;
  lid text := payload->>'locationId';
  service_date date := (payload->>'date')::date;
begin
  if payload ? 'updatedAt' then
    select updated_at into existing from public.schedule_date_overrides
      where location_id = lid and schedule_date_overrides.service_date = service_date
      for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.schedule_date_overrides set
      closed = (payload->>'closed')::boolean,
      opens = nullif(payload->>'opens', '')::time,
      cutoff = nullif(payload->>'cutoff', '')::time
    where location_id = lid and schedule_date_overrides.service_date = service_date;
  else
    insert into public.schedule_date_overrides (location_id, service_date, closed, opens, cutoff)
    values (
      lid, service_date, (payload->>'closed')::boolean,
      nullif(payload->>'opens', '')::time, nullif(payload->>'cutoff', '')::time
    );
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_delete_override(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing timestamptz;
begin
  select updated_at into existing from public.schedule_date_overrides
    where location_id = payload->>'locationId' and service_date = (payload->>'date')::date
    for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  delete from public.schedule_date_overrides
  where location_id = payload->>'locationId' and service_date = (payload->>'date')::date;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_settings(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing timestamptz;
begin
  select updated_at into existing from public.shop_settings where id = 1 for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  update public.shop_settings set
    theme = payload->>'theme',
    booking_horizon_days = (payload->>'bookingHorizonDays')::integer,
    preorder_lead_days = (payload->>'preorderLeadDays')::integer,
    instagram_url = coalesce(payload->>'instagramUrl', ''),
    instagram_dm_url = coalesce(payload->>'instagramDmUrl', ''),
    messenger_url = coalesce(payload->>'messengerUrl', '')
  where id = 1;
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_featured(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.featured_products;
  insert into public.featured_products (product_id, rank)
  select item, ordinality::integer
  from jsonb_array_elements_text(coalesce(payload->'productIds', '[]'::jsonb)) with ordinality as ranked(item, ordinality);
  return '{}'::jsonb;
end;
$$;

create or replace function public.catalog_save_popup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pid text := payload->>'id';
  existing timestamptz;
begin
  if payload ? 'updatedAt' then
    select updated_at into existing from public.popups where id = pid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    update public.popups set
      location_id = payload->>'locationId',
      name = payload->>'name',
      address = payload->>'address',
      map_url = coalesce(payload->>'mapUrl', ''),
      start_date = (payload->>'startDate')::date,
      end_date = (payload->>'endDate')::date,
      hours = payload->>'hours',
      items = public.jsonb_texts(payload->'items')
    where id = pid;
  else
    insert into public.popups (id, location_id, name, address, map_url, start_date, end_date, hours, items)
    values (
      pid, payload->>'locationId', payload->>'name', payload->>'address', coalesce(payload->>'mapUrl', ''),
      (payload->>'startDate')::date, (payload->>'endDate')::date, payload->>'hours', public.jsonb_texts(payload->'items')
    );
  end if;
  return '{}'::jsonb;
end;
$$;

create or replace function public.apply_catalog_change(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_revision bigint;
  result jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or action is null then
    raise exception 'validation';
  end if;
  update public.storefront_revision
    set revision = revision + 1
    where id = 1 and revision = (payload->>'revision')::bigint
    returning revision into new_revision;
  if new_revision is null then
    raise exception 'stale_save';
  end if;

  result := case action
    when 'save_location' then public.catalog_save_location(payload)
    when 'save_section' then public.catalog_save_section(payload)
    when 'delete_section' then public.catalog_delete_section(payload)
    when 'reorder_sections' then public.catalog_reorder_sections(payload)
    when 'reorder_products' then public.catalog_reorder_products(payload)
    when 'save_product' then public.catalog_save_product(payload)
    when 'save_addon' then public.catalog_save_addon(payload)
    when 'save_schedule' then public.catalog_save_schedule(payload)
    when 'save_override' then public.catalog_save_override(payload)
    when 'delete_override' then public.catalog_delete_override(payload)
    when 'save_settings' then public.catalog_save_settings(payload)
    when 'save_featured' then public.catalog_save_featured(payload)
    when 'save_popup' then public.catalog_save_popup(payload)
    else null
  end;
  if result is null then
    raise exception 'validation';
  end if;
  return result || jsonb_build_object('revision', new_revision, 'affectedOrders', '[]'::jsonb);
end;
$$;

revoke all on function public.jsonb_texts(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.jsonb_smallints(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_location(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_section(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_delete_section(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_reorder_sections(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_reorder_products(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_product(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_addon(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_schedule(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_override(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_delete_override(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_settings(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_featured(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.catalog_save_popup(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_catalog_change(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_catalog_change(text, jsonb) to service_role;

alter table public.storefront_revision enable row level security;
alter table public.storefront_snapshot enable row level security;
revoke all on table public.storefront_revision from public, anon, authenticated;
revoke all on table public.storefront_snapshot from public, anon, authenticated;
grant select, insert, update, delete on table public.storefront_revision to service_role;
grant select, insert, update, delete on table public.storefront_snapshot to service_role;
