-- Protect booked drop dates and allocations while serializing drop edits with order writes.
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

  -- The drop row is locked above, as it is during order placement and edits.
  if exists (
    select 1 from public.drop_dates d
    where d.drop_id = lid
      and exists (select 1 from public.orders o where o.drop_id = lid and o.fulfillment_date = d.service_date)
      and not exists (
        select 1 from jsonb_array_elements(payload->'dates') proposed
        where (proposed->>'date')::date = d.service_date
          and (proposed->>'pickupStarts')::time = d.pickup_starts
          and (proposed->>'pickupEnds')::time = d.pickup_ends
          and (proposed->>'dispatchStarts')::time is not distinct from d.dispatch_starts
          and (proposed->>'dispatchEnds')::time is not distinct from d.dispatch_ends
      )
  ) then raise exception 'booked_date_locked'; end if;

  if exists (
    select 1 from public.drop_offering_dates d
    where d.drop_id = lid and d.committed > 0
      and not exists (
        select 1 from jsonb_array_elements(payload->'offerings') offering
        cross join lateral jsonb_array_elements(offering->'dates') proposed
        where offering->>'id' = d.offering_id
          and (proposed->>'date')::date = d.service_date
          and (proposed->>'allocated')::integer >= d.committed
      )
  ) then raise exception 'committed_allocation'; end if;

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
    if exists (
      select 1 from (
        select product_id, size_id from public.drop_offerings where drop_id = lid and kind = 'size'
        union
        select product_id, size_id from public.drop_package_components where drop_id = lid
      ) source
      join public.products p on p.id = source.product_id
      join public.product_sizes s on s.product_id = source.product_id and s.id = source.size_id
      where not p.enabled or not s.enabled
    ) then raise exception 'disabled_drop_source'; end if;
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

create or replace function public.update_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := (payload->>'orderId')::uuid;
  header record;
  line_row jsonb;
  existing_line record;
  grouped record;
  subtotal integer := 0;
  next_total integer;
  fee_mode text;
  fee integer;
  line_no integer := 0;
  saved_line uuid;
  current_price integer;
  current_name text;
  current_kind text;
  source_product text;
  source_size text;
  addon_name text;
  addon_price integer;
begin
  select * into header from public.orders where id = target for update;
  if header.id is null then perform public.order_fail('not_found'); end if;
  if header.updated_at is distinct from (payload->>'updatedAt')::timestamptz then
    perform public.order_fail('stale_save');
  end if;
  if header.status not in ('pending', 'confirmed') then
    perform public.order_fail('validation');
  end if;
  if payload->>'fulfillment' not in ('pickup', 'delivery') then
    perform public.order_fail('validation');
  end if;
  if header.channel = 'drop' then
    perform 1 from public.drops where id = header.drop_id for update;
  end if;
  if header.channel = 'drop' and (payload->>'fulfillmentDate')::date is distinct from header.fulfillment_date then
    for grouped in
      select offering_id, sum(quantity)::integer as quantity
      from public.order_lines where order_id = target and offering_id is not null
      group by offering_id order by offering_id
    loop
      perform public.consume_drop_qty(header.drop_id, grouped.offering_id, header.fulfillment_date, -grouped.quantity);
    end loop;
    for grouped in
      select coalesce(line_item->>'lineId', '') as line_id, line_item->>'offeringId' as offering_id,
        sum((line_item->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(payload->'lines') line_item
      group by 1, 2 order by 2
    loop
      perform public.consume_drop_qty(header.drop_id, grouped.offering_id, (payload->>'fulfillmentDate')::date, grouped.quantity);
    end loop;
  elsif header.channel = 'drop' then
    for grouped in
      select offering_id, sum(quantity)::integer as quantity from public.order_lines
      where order_id = target and offering_id is not null group by offering_id
    loop
      perform public.consume_drop_qty(header.drop_id, grouped.offering_id, header.fulfillment_date, -grouped.quantity);
    end loop;
    for grouped in
      select line_item->>'offeringId' as offering_id, sum((line_item->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(payload->'lines') line_item
      group by 1 order by 1
    loop
      if grouped.quantity > (
        select per_order_max from public.drop_offerings where drop_id = header.drop_id and id = grouped.offering_id
      ) then perform public.order_fail('validation'); end if;
      perform public.consume_drop_qty(header.drop_id, grouped.offering_id, header.fulfillment_date, grouped.quantity);
    end loop;
  end if;

  drop table if exists pg_temp.snapshot_lines;
  drop table if exists pg_temp.snapshot_components;
  create temp table snapshot_lines on commit drop as
    select * from public.order_lines where order_id = target;
  create temp table snapshot_components on commit drop as
    select component.* from public.order_line_components component
    join snapshot_lines line on line.id = component.line_id;

  delete from public.order_lines where order_id = target;
  drop table if exists pg_temp.snapshot_addons;
  create temp table snapshot_addons on commit drop as
    select * from public.order_addons where order_id = target;
  delete from public.order_addons where order_id = target;
  for line_row in select value from jsonb_array_elements(payload->'lines')
  loop
    if nullif(line_row->>'lineId', '') is not null then
      select * into existing_line from snapshot_lines where id = (line_row->>'lineId')::uuid and order_id = target;
      if existing_line.id is null then perform public.order_fail('validation'); end if;
      current_price := existing_line.unit_price_centavos;
      current_name := existing_line.name;
      current_kind := existing_line.kind;
    elsif header.channel = 'regular' then
      select size.price_centavos, product.name || ' ' || size.label, 'size'
      into current_price, current_name, current_kind
      from public.product_sizes size
      join public.products product on product.id = size.product_id
      where size.product_id = line_row->>'productId' and size.id = line_row->>'sizeId';
      if current_price is null or current_price is distinct from (line_row->>'unitPriceCentavos')::integer then
        perform public.order_fail('price_change', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
          'productId', line_row->>'productId', 'sizeId', line_row->>'sizeId', 'unitPriceCentavos', current_price
        )), 'addons', '[]'::jsonb));
      end if;
    else
      select price_centavos, name, kind, product_id, size_id
      into current_price, current_name, current_kind, source_product, source_size
      from public.drop_offerings where drop_id = header.drop_id and id = line_row->>'offeringId';
      if current_price is null or current_price is distinct from (line_row->>'unitPriceCentavos')::integer then
        perform public.order_fail('price_change', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
          'offeringId', line_row->>'offeringId', 'unitPriceCentavos', current_price
        )), 'addons', '[]'::jsonb));
      end if;
    end if;
    insert into public.order_lines (
      id, order_id, line_no, kind, product_id, size_id, offering_id, name, unit_price_centavos, quantity
    ) values (
      coalesce((nullif(line_row->>'lineId', ''))::uuid, gen_random_uuid()),
      target, line_no, current_kind,
      case when nullif(line_row->>'lineId', '') is not null then existing_line.product_id when header.channel = 'drop' then source_product else nullif(line_row->>'productId', '') end,
      case when nullif(line_row->>'lineId', '') is not null then existing_line.size_id when header.channel = 'drop' then source_size else nullif(line_row->>'sizeId', '') end,
      case when nullif(line_row->>'lineId', '') is null then nullif(line_row->>'offeringId', '') else existing_line.offering_id end,
      current_name, current_price, (line_row->>'quantity')::integer
    ) returning id into saved_line;
    line_no := line_no + 1;
    subtotal := subtotal + current_price * (line_row->>'quantity')::integer;
    if current_kind = 'package' and nullif(line_row->>'lineId', '') is null then
      insert into public.order_line_components (line_id, product_id, size_id, name, quantity)
      select saved_line, component.product_id, component.size_id, product.name || ' ' || size.label, component.quantity
      from public.drop_package_components component
      join public.product_sizes size on size.product_id = component.product_id and size.id = component.size_id
      join public.products product on product.id = size.product_id
      where component.drop_id = header.drop_id and component.offering_id = line_row->>'offeringId';
    elsif current_kind = 'package' then
      insert into public.order_line_components (line_id, product_id, size_id, name, quantity)
      select saved_line, product_id, size_id, name, quantity
      from snapshot_components where line_id = (line_row->>'lineId')::uuid;
    end if;
  end loop;

  for line_row in select value from jsonb_array_elements(coalesce(payload->'addons', '[]'::jsonb))
  loop
    select name, unit_price_centavos into addon_name, addon_price
    from snapshot_addons where add_on_id = line_row->>'id';
    if not found then
    if header.channel = 'regular' then
      select name, price_centavos into addon_name, addon_price from public.add_ons where id = line_row->>'id';
    else
      select name, price_centavos into addon_name, addon_price from public.drop_addons
      where drop_id = header.drop_id and add_on_id = line_row->>'id';
    end if;
    if addon_price is null then perform public.order_fail('validation'); end if;
    if addon_price is distinct from (line_row->>'unitPriceCentavos')::integer then
      perform public.order_fail('price_change', jsonb_build_object('lines', '[]'::jsonb, 'addons',
        jsonb_build_array(jsonb_build_object('id', line_row->>'id', 'unitPriceCentavos', addon_price))));
    end if;
    end if;
    insert into public.order_addons (order_id, add_on_id, name, unit_price_centavos, quantity)
    values (target, line_row->>'id', addon_name, addon_price, (line_row->>'quantity')::integer);
    subtotal := subtotal + addon_price * (line_row->>'quantity')::integer;
  end loop;

  fee_mode := case
    when payload->>'fulfillment' = 'pickup' then null
    else coalesce(payload->>'deliveryFeeMode', header.delivery_fee_mode, 'unknown')
  end;
  fee := case when fee_mode = 'known' then (payload->>'deliveryFeeCentavos')::integer else null end;
  next_total := case
    when payload->>'fulfillment' = 'pickup' or fee_mode = 'rider' then subtotal
    when fee_mode = 'known' then subtotal + fee
    else null
  end;
  if header.payment = 'paid' and next_total is distinct from header.total_centavos and payload->>'paymentStatus' is null then
    perform public.order_fail('validation');
  end if;

  update public.orders set
    fulfillment = payload->>'fulfillment',
    fulfillment_date = (payload->>'fulfillmentDate')::date,
    slot_id = case when header.channel = 'regular' then payload->>'slotId' else null end,
    delivery_fee_mode = fee_mode,
    delivery_fee_centavos = fee,
    subtotal_centavos = subtotal,
    total_centavos = next_total,
    payment = case
      when header.payment = 'paid' and next_total is distinct from header.total_centavos then payload->>'paymentStatus'
      else header.payment
    end,
    customer_name = btrim(payload->>'customerName'),
    customer_phone = btrim(payload->>'customerPhone'),
    delivery_address = nullif(btrim(coalesce(payload->>'deliveryAddress', '')), ''),
    notes = nullif(btrim(coalesce(payload->>'notes', '')), '')
  where id = target;
  return jsonb_build_object('orderId', target);
end;
$$;

create function public.admin_booked_drop_dates()
returns table (drop_id text, date date)
language sql
stable
set search_path = public
as $$
  select distinct o.drop_id, o.fulfillment_date from public.orders o where o.drop_id is not null;
$$;

revoke all on function public.admin_booked_drop_dates() from public, anon, authenticated;
grant execute on function public.admin_booked_drop_dates() to service_role;
