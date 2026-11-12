create or replace function public.place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  actor text := coalesce(payload->>'actor', 'public');
  allow_unavailable boolean := actor = 'admin' and coalesce((payload->>'allowUnavailable')::boolean, false);
  channel text := payload->>'channel';
  location_id text := payload->>'locationId';
  drop_id text := nullif(payload->>'dropId', '');
  fulfillment text := payload->>'fulfillment';
  fulfillment_date date := (payload->>'fulfillmentDate')::date;
  slot_id text := nullif(payload->>'slotId', '');
  idempotency_key text := payload->>'idempotencyKey';
  today date := public.order_manila_today();
  manila_now timestamp := now() at time zone 'Asia/Manila';
  digest text;
  existing_order uuid;
  existing_digest text;
  existing_number text;
  line_row jsonb;
  addon_row jsonb;
  grouped record;
  current_price integer;
  current_name text;
  current_kind text;
  subtotal integer := 0;
  order_id uuid;
  sequence_no integer;
  order_number text;
  after_hours boolean := false;
  opens time;
  cutoff time;
  window_start time;
  window_end time;
  line_no integer := 0;
  saved_line uuid;
  component_row record;
  addon_name text;
  addon_price integer;
  location_kind text;
  accepting boolean;
  location_delivery boolean;
  drop_status text;
  drop_delivery boolean;
  ordering_open time;
  ordering_close time;
  pickup_start time;
  pickup_end time;
  dispatch_start time;
  dispatch_end time;
  per_order_max integer;
  source_enabled boolean;
  source_product text;
  source_size text;
  price_mismatch jsonb := '[]'::jsonb;
  addon_mismatch jsonb := '[]'::jsonb;
  shortages jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(idempotency_key));
  select string_agg(item_key || ':' || item_qty || ':' || item_price, ',' order by item_key)
  into digest
  from (
    select coalesce(nullif(item->>'offeringId', ''), (item->>'productId') || ':' || (item->>'sizeId')) as item_key,
      sum((item->>'quantity')::integer)::text as item_qty,
      min((item->>'unitPriceCentavos')::integer)::text as item_price
    from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb)) item
    group by 1
  ) lines;
  digest := md5(concat_ws('|', channel, location_id, coalesce(drop_id, ''), fulfillment_date, fulfillment, coalesce(slot_id, ''), digest, (
    select coalesce(string_agg((item->>'id') || ':' || (item->>'quantity') || ':' || (item->>'unitPriceCentavos'), ',' order by item->>'id'), '')
    from jsonb_array_elements(coalesce(payload->'addons', '[]'::jsonb)) item
  )));

  if fulfillment = 'delivery' and (payload->>'deliveryFeeMode' = 'rider'
    or (actor = 'admin' and payload->>'deliveryFeeMode' = 'known')) then
    digest := md5(concat_ws('|', digest, payload->>'deliveryFeeMode',
      case when payload->>'deliveryFeeMode' = 'known' then payload->>'deliveryFeeCentavos' end));
  end if;

  select order_idempotency.order_id, order_idempotency.digest, orders.order_number
  into existing_order, existing_digest, existing_number
  from public.order_idempotency
  join public.orders on orders.id = order_idempotency.order_id
  where order_idempotency.idempotency_key = idempotency_key;
  if existing_order is not null then
    if existing_digest is distinct from digest then
      perform public.order_fail('idempotency_mismatch');
    end if;
    return jsonb_build_object('orderId', existing_order, 'orderNumber', existing_number, 'submittedAfterHours', (
      select submitted_after_hours from public.orders where id = existing_order
    ), 'replayed', true);
  end if;

  if jsonb_array_length(coalesce(payload->'lines', '[]'::jsonb)) < 1 then
    perform public.order_fail('validation');
  end if;
  if fulfillment = 'delivery' and char_length(btrim(coalesce(payload->>'deliveryAddress', ''))) < 1 then
    perform public.order_fail('validation');
  end if;

  select kind, accepting_orders, delivery_enabled into location_kind, accepting, location_delivery from public.locations where id = location_id;
  if location_kind is null then perform public.order_fail('validation'); end if;

  if channel = 'regular' then
    if location_kind <> 'regular' or drop_id is not null or slot_id is null then
      perform public.order_fail('validation');
    end if;
    if fulfillment = 'delivery' and not location_delivery then
      perform public.order_fail('validation');
    end if;
    select
      case when override.closed then null else coalesce(override.opens, schedule.opens) end,
      case when override.closed then null else coalesce(override.cutoff, schedule.cutoff) end
    into opens, cutoff
    from public.branch_schedules schedule
    left join public.schedule_date_overrides override
      on override.location_id = schedule.location_id and override.service_date = today
    where schedule.location_id = location_id;
    after_hours := opens is null or manila_now::time < opens or manila_now::time >= cutoff;
    if not allow_unavailable and (not accepting or fulfillment_date < today) then
      perform public.order_fail('closed_ordering');
    end if;
    select
      case when override.closed then null else coalesce(override.opens, schedule.opens) end,
      case when override.closed or schedule.enabled is false then null else coalesce(override.cutoff, schedule.cutoff) end
    into window_start, window_end
    from public.branch_schedules schedule
    left join public.schedule_date_overrides override
      on override.location_id = schedule.location_id and override.service_date = fulfillment_date
    where schedule.location_id = location_id
      and (override.location_id is not null or extract(dow from fulfillment_date)::integer = any (schedule.weekdays));
    if not allow_unavailable and (window_start is null or slot_id::time < window_start or (slot_id::time + interval '1 hour')::time > window_end) then
      perform public.order_fail('closed_ordering');
    end if;
    if not allow_unavailable and fulfillment_date = today and (fulfillment_date + slot_id::time) <= manila_now then
      perform public.order_fail('closed_ordering');
    end if;
    window_start := slot_id::time;
    window_end := (slot_id::time + interval '1 hour')::time;
  else
    if location_kind <> 'drop' or drop_id is null or slot_id is not null then
      perform public.order_fail('validation');
    end if;
    select status, delivery_enabled, drops.location_id into drop_status, drop_delivery, current_name
    from public.drops where id = drop_id for update;
    if drop_status is distinct from 'published' or current_name is distinct from location_id then
      perform public.order_fail('closed_ordering');
    end if;
    if fulfillment = 'delivery' and not drop_delivery then
      perform public.order_fail('validation');
    end if;
    select ordering_opens, ordering_cutoff, pickup_starts, pickup_ends, dispatch_starts, dispatch_ends
    into ordering_open, ordering_close, pickup_start, pickup_end, dispatch_start, dispatch_end
    from public.drop_dates where drop_dates.drop_id = drop_id and service_date = fulfillment_date;
    if ordering_open is null or fulfillment_date is distinct from today
      or manila_now::time < ordering_open or manila_now::time >= ordering_close then
      perform public.order_fail('closed_ordering');
    end if;
    if fulfillment = 'delivery' then
      window_start := dispatch_start;
      window_end := dispatch_end;
    else
      window_start := pickup_start;
      window_end := pickup_end;
    end if;
    if window_start is null or window_end is null then
      perform public.order_fail('validation');
    end if;
  end if;

  for grouped in
    select coalesce(nullif(item->>'offeringId', ''), '') as offering_id,
      nullif(item->>'productId', '') as product_id,
      nullif(item->>'sizeId', '') as size_id,
      sum((item->>'quantity')::integer)::integer as quantity,
      min((item->>'unitPriceCentavos')::integer)::integer as unit_price,
      count(distinct (item->>'unitPriceCentavos')) as price_count
    from jsonb_array_elements(payload->'lines') item
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    if grouped.price_count <> 1 or grouped.quantity < 1 then
      perform public.order_fail('validation');
    end if;
    if channel = 'regular' then
      select size.price_centavos, product.name || ' ' || size.label, size.mode,
        product.enabled and size.enabled and exists (
          select 1 from public.size_branch_assignments assignment
          where assignment.product_id = product.id and assignment.size_id = size.id and assignment.location_id = location_id
        )
        and (product.season_start is null or (fulfillment_date >= product.season_start and fulfillment_date <= product.season_end))
        and (size.mode = 'preorder' or extract(dow from fulfillment_date)::integer = any (section.weekdays))
      into current_price, current_name, current_kind, source_enabled
      from public.product_sizes size
      join public.products product on product.id = size.product_id
      join public.menu_sections section on section.id = product.section_id
      where size.product_id = grouped.product_id and size.id = grouped.size_id;
      if current_price is null then perform public.order_fail('validation'); end if;
      if grouped.unit_price is distinct from current_price then
        price_mismatch := price_mismatch || jsonb_build_array(jsonb_build_object('productId', grouped.product_id, 'sizeId', grouped.size_id, 'unitPriceCentavos', current_price));
      elsif not allow_unavailable and not source_enabled then
        perform public.order_fail('closed_ordering');
      elsif not allow_unavailable and (
        fulfillment_date > today + (select booking_horizon_days from public.shop_settings where id = 1)
        or (current_kind = 'preorder' and fulfillment_date < today + (select preorder_lead_days from public.shop_settings where id = 1))
      ) then
        perform public.order_fail('closed_ordering');
      end if;
    else
      select offering.price_centavos, offering.name, offering.kind, offering.per_order_max,
        exists (
          select 1 from public.drop_offering_dates allocation
          where allocation.drop_id = drop_id and allocation.offering_id = offering.id
            and allocation.service_date = fulfillment_date and allocation.included
        )
      into current_price, current_name, current_kind, per_order_max, source_enabled
      from public.drop_offerings offering
      where offering.drop_id = drop_id and offering.id = grouped.offering_id;
      if current_price is null or not source_enabled then perform public.order_fail('closed_ordering'); end if;
      if grouped.quantity > per_order_max then perform public.order_fail('validation'); end if;
      if grouped.unit_price is distinct from current_price then
        price_mismatch := price_mismatch || jsonb_build_array(jsonb_build_object('offeringId', grouped.offering_id, 'unitPriceCentavos', current_price));
      elsif current_kind = 'size' then
        select product.enabled and size.enabled into source_enabled
        from public.drop_offerings offering
        join public.product_sizes size on size.product_id = offering.product_id and size.id = offering.size_id
        join public.products product on product.id = size.product_id
        where offering.drop_id = drop_id and offering.id = grouped.offering_id;
        if not source_enabled then perform public.order_fail('closed_ordering'); end if;
      else
        select bool_and(product.enabled and size.enabled) into source_enabled
        from public.drop_package_components component
        join public.product_sizes size on size.product_id = component.product_id and size.id = component.size_id
        join public.products product on product.id = size.product_id
        where component.drop_id = drop_id and component.offering_id = grouped.offering_id;
        if source_enabled is distinct from true then perform public.order_fail('closed_ordering'); end if;
      end if;
    end if;
  end loop;

  for addon_row in select value from jsonb_array_elements(coalesce(payload->'addons', '[]'::jsonb))
  loop
    if channel = 'regular' then
      select addon.price_centavos, addon.name into addon_price, addon_name
      from public.add_ons addon
      join public.add_on_locations link on link.add_on_id = addon.id and link.location_id = location_id
      where addon.id = addon_row->>'id' and addon.enabled;
    else
      select addon.price_centavos, addon.name into addon_price, addon_name
      from public.drop_addons addon
      where addon.drop_id = drop_id and addon.add_on_id = addon_row->>'id';
    end if;
    if addon_price is null then perform public.order_fail('validation'); end if;
    if (addon_row->>'unitPriceCentavos')::integer is distinct from addon_price then
      addon_mismatch := addon_mismatch || jsonb_build_array(jsonb_build_object('id', addon_row->>'id', 'unitPriceCentavos', addon_price));
    end if;
  end loop;
  if price_mismatch <> '[]'::jsonb or addon_mismatch <> '[]'::jsonb then
    perform public.order_fail('price_change', jsonb_build_object('lines', price_mismatch, 'addons', addon_mismatch));
  end if;

  if channel = 'drop' then
    -- The drop row is already locked. Check all shortages before consuming stock.
    select jsonb_agg(jsonb_build_object(
      'id', requested.offering_id,
      'remaining', greatest(coalesce(stock.allocated - stock.committed, 0), 0)
    ) order by requested.offering_id)
    into shortages
    from (
      select item->>'offeringId' as offering_id, sum((item->>'quantity')::integer) as quantity
      from jsonb_array_elements(payload->'lines') item
      group by 1
    ) requested
    left join public.drop_offering_dates stock
      on stock.drop_id = drop_id and stock.offering_id = requested.offering_id
      and stock.service_date = fulfillment_date and stock.included
    where requested.quantity > coalesce(stock.allocated - stock.committed, 0);

    if shortages is not null then
      perform public.order_fail('unavailable', jsonb_build_object('offerings', shortages));
    end if;

    for grouped in
      select item->>'offeringId' as offering_id, sum((item->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(payload->'lines') item
      group by 1
      order by 1
    loop
      perform public.consume_drop_qty(drop_id, grouped.offering_id, fulfillment_date, grouped.quantity);
      update public.drop_offerings
      set contents_locked_at = coalesce(contents_locked_at, now())
      where drop_offerings.drop_id = drop_id and drop_offerings.id = grouped.offering_id and kind = 'package';
    end loop;
  end if;

  insert into public.daily_order_sequences as sequence (service_date, last_value)
  values (today, 1)
  on conflict (service_date) do update set last_value = sequence.last_value + 1
  returning last_value into sequence_no;
  order_number := 'MP-' || to_char(today, 'MMDD') || case when sequence_no < 1000 then lpad(sequence_no::text, 3, '0') else sequence_no::text end;

  insert into public.orders (
    order_number, sequence_date, sequence_no, channel, location_id, drop_id, fulfillment_date, fulfillment,
    slot_id, window_starts, window_ends, status, payment, delivery_fee_mode, delivery_fee_centavos,
    subtotal_centavos, total_centavos, customer_name, customer_phone, delivery_address, notes, submitted_after_hours
  ) values (
    order_number, today, sequence_no, channel, location_id, drop_id, fulfillment_date, fulfillment,
    slot_id, window_start, window_end, 'pending', 'unpaid',
    case when fulfillment = 'delivery' then 'unknown' else null end,
    null, 0, case when fulfillment = 'delivery' then null else 0 end,
    btrim(payload->>'customerName'), btrim(payload->>'customerPhone'),
    nullif(btrim(coalesce(payload->>'deliveryAddress', '')), ''),
    nullif(btrim(coalesce(payload->>'notes', '')), ''),
    channel = 'regular' and after_hours
  ) returning id into order_id;

  for grouped in
    select coalesce(nullif(item->>'offeringId', ''), '') as offering_id,
      nullif(item->>'productId', '') as product_id,
      nullif(item->>'sizeId', '') as size_id,
      sum((item->>'quantity')::integer)::integer as quantity,
      min((item->>'unitPriceCentavos')::integer)::integer as unit_price
    from jsonb_array_elements(payload->'lines') item
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    if channel = 'regular' then
      select product.name || ' ' || size.label into current_name
      from public.product_sizes size
      join public.products product on product.id = size.product_id
      where size.product_id = grouped.product_id and size.id = grouped.size_id;
      current_kind := 'size';
      source_product := grouped.product_id;
      source_size := grouped.size_id;
    else
      select name, kind, product_id, size_id into current_name, current_kind, source_product, source_size
      from public.drop_offerings
      where drop_offerings.drop_id = drop_id and drop_offerings.id = grouped.offering_id;
    end if;
    insert into public.order_lines (
      order_id, line_no, kind, product_id, size_id, offering_id, name, unit_price_centavos, quantity
    ) values (
      order_id, line_no, current_kind, source_product, source_size,
      nullif(grouped.offering_id, ''), current_name, grouped.unit_price, grouped.quantity
    ) returning id into saved_line;
    line_no := line_no + 1;
    subtotal := subtotal + grouped.unit_price * grouped.quantity;
    if current_kind = 'package' then
      for component_row in
        select component.product_id, component.size_id, component.quantity, product.name || ' ' || size.label as name
        from public.drop_package_components component
        join public.product_sizes size on size.product_id = component.product_id and size.id = component.size_id
        join public.products product on product.id = size.product_id
        where component.drop_id = drop_id and component.offering_id = grouped.offering_id
      loop
        insert into public.order_line_components (line_id, product_id, size_id, name, quantity)
        values (saved_line, component_row.product_id, component_row.size_id, component_row.name, component_row.quantity);
      end loop;
    end if;
  end loop;

  for addon_row in select value from jsonb_array_elements(coalesce(payload->'addons', '[]'::jsonb))
  loop
    if channel = 'regular' then
      select name, price_centavos into addon_name, addon_price from public.add_ons where id = addon_row->>'id';
    else
      select name, price_centavos into addon_name, addon_price from public.drop_addons
      where drop_addons.drop_id = drop_id and add_on_id = addon_row->>'id';
    end if;
    insert into public.order_addons (order_id, add_on_id, name, unit_price_centavos, quantity)
    values (order_id, addon_row->>'id', addon_name, addon_price, (addon_row->>'quantity')::integer);
    subtotal := subtotal + addon_price * (addon_row->>'quantity')::integer;
  end loop;

  perform set_config('makalipie.skip_order_event', 'on', true);
  update public.orders set
    subtotal_centavos = subtotal,
    delivery_fee_mode = case when fulfillment = 'delivery' then
      case when payload->>'deliveryFeeMode' = 'rider' then 'rider'
        when actor = 'admin' then coalesce(payload->>'deliveryFeeMode', 'unknown') else 'unknown' end end,
    delivery_fee_centavos = case when fulfillment = 'delivery' and actor = 'admin'
      and payload->>'deliveryFeeMode' = 'known' then (payload->>'deliveryFeeCentavos')::integer end,
    total_centavos = case when fulfillment = 'pickup' then subtotal
      when actor = 'admin' and payload->>'deliveryFeeMode' = 'known' then subtotal + (payload->>'deliveryFeeCentavos')::integer
      when payload->>'deliveryFeeMode' = 'rider' then subtotal end
  where id = order_id;
  perform set_config('makalipie.skip_order_event', 'off', true);

  insert into public.order_idempotency (idempotency_key, digest, order_id)
  values (idempotency_key, digest, order_id);

  return jsonb_build_object(
    'orderId', order_id,
    'orderNumber', order_number,
    'submittedAfterHours', channel = 'regular' and after_hours,
    'replayed', false
  );
end;
$$;
