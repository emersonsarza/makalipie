-- Phase 3 drop events. Orders do not consume allocation yet, so committed stays 0.

create table public.drop_revision (
  id integer primary key check (id = 1),
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default now()
);

insert into public.drop_revision (id, revision) values (1, 1);

create table public.drop_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null,
  payload jsonb not null,
  stored_at timestamptz not null default now()
);

create table public.drops (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  location_id text not null references public.locations (id) on delete restrict,
  status text not null check (status in ('draft', 'published', 'ended')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  map_url text not null default '' check (map_url = '' or map_url ~ '^https://'),
  delivery_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drop_dates (
  drop_id text not null references public.drops (id) on delete cascade,
  service_date date not null,
  ordering_opens time not null,
  ordering_cutoff time not null,
  pickup_starts time not null,
  pickup_ends time not null,
  dispatch_starts time,
  dispatch_ends time,
  primary key (drop_id, service_date),
  constraint drop_dates_ordering check (ordering_opens < ordering_cutoff),
  constraint drop_dates_pickup check (pickup_starts < pickup_ends),
  constraint drop_dates_dispatch check (
    (dispatch_starts is null and dispatch_ends is null)
    or (dispatch_starts is not null and dispatch_ends is not null and dispatch_starts < dispatch_ends)
  )
);

create table public.drop_offerings (
  drop_id text not null references public.drops (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kind text not null check (kind in ('size', 'package')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  price_centavos integer not null check (price_centavos >= 0),
  per_order_max integer not null check (per_order_max >= 1),
  product_id text,
  size_id text,
  sort_order integer not null,
  contents_locked_at timestamptz,
  primary key (drop_id, id),
  foreign key (product_id, size_id) references public.product_sizes (product_id, id) on delete restrict,
  constraint drop_offerings_shape check (
    (kind = 'size' and product_id is not null and size_id is not null)
    or (kind = 'package' and product_id is null and size_id is null)
  )
);

create table public.drop_package_components (
  drop_id text not null,
  offering_id text not null,
  product_id text not null,
  size_id text not null,
  quantity integer not null check (quantity between 1 and 4),
  primary key (drop_id, offering_id, product_id, size_id),
  foreign key (drop_id, offering_id) references public.drop_offerings (drop_id, id) on delete cascade,
  foreign key (product_id, size_id) references public.product_sizes (product_id, id) on delete restrict
);

create table public.drop_offering_dates (
  drop_id text not null,
  offering_id text not null,
  service_date date not null,
  included boolean not null,
  allocated integer not null check (allocated >= 0),
  committed integer not null default 0 check (committed >= 0),
  primary key (drop_id, offering_id, service_date),
  foreign key (drop_id, offering_id) references public.drop_offerings (drop_id, id) on delete cascade,
  foreign key (drop_id, service_date) references public.drop_dates (drop_id, service_date) on delete cascade,
  constraint drop_offering_dates_floor check (committed <= allocated)
);

create table public.drop_addons (
  drop_id text not null references public.drops (id) on delete cascade,
  add_on_id text not null references public.add_ons (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  price_centavos integer not null check (price_centavos >= 0),
  icon text not null check (icon in ('gift', 'note', 'default')),
  sort_order integer not null,
  primary key (drop_id, add_on_id)
);

create or replace function public.require_drop_location()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  location_kind text;
begin
  select kind into location_kind from public.locations where id = new.location_id;
  if location_kind is distinct from 'drop' then
    raise exception 'validation';
  end if;
  return new;
end;
$$;

create trigger drops_require_drop_location before insert or update of location_id on public.drops
  for each row execute function public.require_drop_location();

create trigger drops_set_updated_at before update on public.drops
  for each row execute function public.set_updated_at();

create or replace function public.drop_save(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lid text := payload->>'id';
  existing timestamptz;
  current_location text;
  current_status text;
  locked timestamptz;
  date_row jsonb;
  offering_row jsonb;
  component_row jsonb;
  allocation_row jsonb;
  addon_row jsonb;
  addon_name text;
  addon_icon text;
  existing_committed integer;
  component_total integer;
begin
  if payload ? 'updatedAt' then
    select updated_at, location_id, status into existing, current_location, current_status
    from public.drops where id = lid for update;
    if existing is null then raise exception 'not_found'; end if;
    if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
    if current_status = 'ended' then raise exception 'validation'; end if;
    if current_location is distinct from payload->>'locationId' then raise exception 'validation'; end if;
    update public.drops set
      name = payload->>'name',
      address = payload->>'address',
      map_url = coalesce(payload->>'mapUrl', ''),
      delivery_enabled = (payload->>'deliveryEnabled')::boolean
    where id = lid;
  else
    insert into public.drops (id, location_id, status, name, address, map_url, delivery_enabled)
    values (
      lid, payload->>'locationId', 'draft', payload->>'name', payload->>'address',
      coalesce(payload->>'mapUrl', ''), (payload->>'deliveryEnabled')::boolean
    );
  end if;

  delete from public.drop_dates
  where drop_id = lid
    and service_date not in (
      select (item->>'date')::date from jsonb_array_elements(coalesce(payload->'dates', '[]'::jsonb)) item
    );

  for date_row in select value from jsonb_array_elements(coalesce(payload->'dates', '[]'::jsonb))
  loop
    insert into public.drop_dates (
      drop_id, service_date, ordering_opens, ordering_cutoff, pickup_starts, pickup_ends, dispatch_starts, dispatch_ends
    ) values (
      lid, (date_row->>'date')::date,
      (date_row->>'orderingOpens')::time, (date_row->>'orderingCutoff')::time,
      (date_row->>'pickupStarts')::time, (date_row->>'pickupEnds')::time,
      nullif(date_row->>'dispatchStarts', '')::time, nullif(date_row->>'dispatchEnds', '')::time
    )
    on conflict (drop_id, service_date) do update set
      ordering_opens = excluded.ordering_opens,
      ordering_cutoff = excluded.ordering_cutoff,
      pickup_starts = excluded.pickup_starts,
      pickup_ends = excluded.pickup_ends,
      dispatch_starts = excluded.dispatch_starts,
      dispatch_ends = excluded.dispatch_ends;
  end loop;

  if exists (
    select 1 from public.drop_offerings
    where drop_id = lid and contents_locked_at is not null
      and id not in (select item->>'id' from jsonb_array_elements(coalesce(payload->'offerings', '[]'::jsonb)) item)
  ) then
    raise exception 'validation';
  end if;

  delete from public.drop_offerings
  where drop_id = lid
    and id not in (select item->>'id' from jsonb_array_elements(coalesce(payload->'offerings', '[]'::jsonb)) item);

  for offering_row in select value from jsonb_array_elements(coalesce(payload->'offerings', '[]'::jsonb))
  loop
    if offering_row->>'kind' = 'package' then
      select coalesce(sum((item->>'quantity')::integer), 0) into component_total
      from jsonb_array_elements(coalesce(offering_row->'components', '[]'::jsonb)) item;
      if component_total <> 4 then raise exception 'validation'; end if;
    end if;

    locked := null;
    select contents_locked_at into locked from public.drop_offerings
    where drop_id = lid and id = offering_row->>'id';

    insert into public.drop_offerings (
      drop_id, id, kind, name, price_centavos, per_order_max, product_id, size_id, sort_order
    ) values (
      lid, offering_row->>'id', offering_row->>'kind', offering_row->>'name',
      (offering_row->>'priceCentavos')::integer, (offering_row->>'perOrderMax')::integer,
      nullif(offering_row->>'productId', ''), nullif(offering_row->>'sizeId', ''),
      (offering_row->>'sortOrder')::integer
    )
    on conflict (drop_id, id) do update set
      kind = excluded.kind,
      name = excluded.name,
      price_centavos = excluded.price_centavos,
      per_order_max = excluded.per_order_max,
      product_id = excluded.product_id,
      size_id = excluded.size_id,
      sort_order = excluded.sort_order;

    if locked is not null then
      if exists (
        select 1 from (
          select product_id, size_id, quantity from public.drop_package_components
          where drop_id = lid and offering_id = offering_row->>'id'
          except
          select item->>'productId', item->>'sizeId', (item->>'quantity')::integer
          from jsonb_array_elements(coalesce(offering_row->'components', '[]'::jsonb)) item
        ) changed
      ) or exists (
        select 1 from (
          select item->>'productId', item->>'sizeId', (item->>'quantity')::integer
          from jsonb_array_elements(coalesce(offering_row->'components', '[]'::jsonb)) item
          except
          select product_id, size_id, quantity from public.drop_package_components
          where drop_id = lid and offering_id = offering_row->>'id'
        ) changed
      ) then
        raise exception 'validation';
      end if;
    else
      delete from public.drop_package_components where drop_id = lid and offering_id = offering_row->>'id';
      if offering_row->>'kind' = 'package' then
        for component_row in select value from jsonb_array_elements(coalesce(offering_row->'components', '[]'::jsonb))
        loop
          insert into public.drop_package_components (drop_id, offering_id, product_id, size_id, quantity)
          values (
            lid, offering_row->>'id', component_row->>'productId', component_row->>'sizeId',
            (component_row->>'quantity')::integer
          );
        end loop;
      end if;
    end if;

    for allocation_row in select value from jsonb_array_elements(coalesce(offering_row->'dates', '[]'::jsonb))
    loop
      existing_committed := null;
      select committed into existing_committed from public.drop_offering_dates
      where drop_id = lid and offering_id = offering_row->>'id' and service_date = (allocation_row->>'date')::date;
      if existing_committed is not null and existing_committed > (allocation_row->>'allocated')::integer then
        raise exception 'validation';
      end if;
      insert into public.drop_offering_dates (drop_id, offering_id, service_date, included, allocated, committed)
      values (
        lid, offering_row->>'id', (allocation_row->>'date')::date,
        (allocation_row->>'included')::boolean, (allocation_row->>'allocated')::integer,
        coalesce(existing_committed, 0)
      )
      on conflict (drop_id, offering_id, service_date) do update set
        included = excluded.included,
        allocated = excluded.allocated;
    end loop;

    delete from public.drop_offering_dates
    where drop_id = lid and offering_id = offering_row->>'id'
      and service_date not in (
        select (item->>'date')::date from jsonb_array_elements(coalesce(offering_row->'dates', '[]'::jsonb)) item
      );
  end loop;

  delete from public.drop_addons where drop_id = lid;
  for addon_row in select value from jsonb_array_elements(coalesce(payload->'addons', '[]'::jsonb))
  loop
    addon_name := null;
    select name, icon into addon_name, addon_icon from public.add_ons where id = addon_row->>'addOnId';
    if addon_name is null then raise exception 'validation'; end if;
    insert into public.drop_addons (drop_id, add_on_id, name, price_centavos, icon, sort_order)
    values (
      lid, addon_row->>'addOnId', addon_name, (addon_row->>'priceCentavos')::integer, addon_icon,
      coalesce((addon_row->>'sortOrder')::integer, 0)
    );
  end loop;
  return '{}'::jsonb;
end;
$$;

create or replace function public.drop_set_status(payload jsonb, from_status text, to_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lid text := payload->>'id';
  existing timestamptz;
  current_status text;
  delivery boolean;
begin
  select updated_at, status, delivery_enabled into existing, current_status, delivery
  from public.drops where id = lid for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  if current_status is distinct from from_status then raise exception 'validation'; end if;
  if to_status = 'published' then
    if not exists (select 1 from public.drop_dates where drop_id = lid) then raise exception 'validation'; end if;
    if not exists (select 1 from public.drop_offerings where drop_id = lid) then raise exception 'validation'; end if;
    if delivery and exists (
      select 1 from public.drop_dates where drop_id = lid and dispatch_starts is null
    ) then raise exception 'validation'; end if;
    if not delivery and exists (
      select 1 from public.drop_dates where drop_id = lid and dispatch_starts is not null
    ) then raise exception 'validation'; end if;
    if exists (
      select 1
      from public.drop_offerings offering
      cross join public.drop_dates service_day
      where offering.drop_id = lid and service_day.drop_id = lid
        and not exists (
          select 1 from public.drop_offering_dates allocation
          where allocation.drop_id = lid
            and allocation.offering_id = offering.id
            and allocation.service_date = service_day.service_date
        )
    ) then raise exception 'validation'; end if;
  end if;
  update public.drops set status = to_status where id = lid;
  return '{}'::jsonb;
end;
$$;

create or replace function public.drop_duplicate(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text := payload->>'id';
  copy_id text := payload->>'newId';
  existing timestamptz;
begin
  select updated_at into existing from public.drops where id = source_id for update;
  if existing is null then raise exception 'not_found'; end if;
  if existing is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'stale_save'; end if;
  insert into public.drops (id, location_id, status, name, address, map_url, delivery_enabled)
  select copy_id, location_id, 'draft', name, address, map_url, delivery_enabled
  from public.drops where id = source_id;
  insert into public.drop_offerings (
    drop_id, id, kind, name, price_centavos, per_order_max, product_id, size_id, sort_order, contents_locked_at
  )
  select copy_id, id, kind, name, price_centavos, per_order_max, product_id, size_id, sort_order, null
  from public.drop_offerings where drop_id = source_id;
  insert into public.drop_package_components (drop_id, offering_id, product_id, size_id, quantity)
  select copy_id, offering_id, product_id, size_id, quantity
  from public.drop_package_components where drop_id = source_id;
  insert into public.drop_addons (drop_id, add_on_id, name, price_centavos, icon, sort_order)
  select copy_id, add_on_id, name, price_centavos, icon, sort_order
  from public.drop_addons where drop_id = source_id;
  return '{}'::jsonb;
end;
$$;

create or replace function public.apply_drop_change(action text, payload jsonb)
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
  update public.drop_revision
    set revision = revision + 1
    where id = 1 and revision = (payload->>'revision')::bigint
    returning revision into new_revision;
  if new_revision is null then
    raise exception 'stale_save';
  end if;
  result := case action
    when 'save_drop' then public.drop_save(payload)
    when 'publish_drop' then public.drop_set_status(payload, 'draft', 'published')
    when 'unpublish_drop' then public.drop_set_status(payload, 'published', 'draft')
    when 'end_drop' then public.drop_set_status(payload, 'published', 'ended')
    when 'duplicate_drop' then public.drop_duplicate(payload)
    else null
  end;
  if result is null then raise exception 'validation'; end if;
  return result || jsonb_build_object('revision', new_revision);
end;
$$;

revoke all on function public.require_drop_location() from public, anon, authenticated, service_role;
revoke all on function public.drop_save(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.drop_set_status(jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.drop_duplicate(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.apply_drop_change(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_drop_change(text, jsonb) to service_role;

alter table public.drop_revision enable row level security;
alter table public.drop_snapshot enable row level security;
alter table public.drops enable row level security;
alter table public.drop_dates enable row level security;
alter table public.drop_offerings enable row level security;
alter table public.drop_package_components enable row level security;
alter table public.drop_offering_dates enable row level security;
alter table public.drop_addons enable row level security;

revoke all on table public.drop_revision from public, anon, authenticated;
revoke all on table public.drop_snapshot from public, anon, authenticated;
revoke all on table public.drops from public, anon, authenticated;
revoke all on table public.drop_dates from public, anon, authenticated;
revoke all on table public.drop_offerings from public, anon, authenticated;
revoke all on table public.drop_package_components from public, anon, authenticated;
revoke all on table public.drop_offering_dates from public, anon, authenticated;
revoke all on table public.drop_addons from public, anon, authenticated;

grant select, insert, update, delete on table public.drop_revision to service_role;
grant select, insert, update, delete on table public.drop_snapshot to service_role;
grant select, insert, update, delete on table public.drops to service_role;
grant select, insert, update, delete on table public.drop_dates to service_role;
grant select, insert, update, delete on table public.drop_offerings to service_role;
grant select, insert, update, delete on table public.drop_package_components to service_role;
grant select, insert, update, delete on table public.drop_offering_dates to service_role;
grant select, insert, update, delete on table public.drop_addons to service_role;
