-- A paid delivery can still have an unknown fee (total is null). Setting that
-- fee completes the total; it is not a change to an already settled amount.

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
  if header.payment = 'paid'
    and header.total_centavos is not null
    and next_total is distinct from header.total_centavos
    and payload->>'paymentStatus' is null then
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
      when header.payment = 'paid' and next_total is distinct from header.total_centavos
        then coalesce(payload->>'paymentStatus', header.payment)
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
