create function public.set_delivery_fee(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  target uuid := (payload->>'orderId')::uuid;
  fee_mode text := payload->>'deliveryFeeMode';
  fee integer;
  header public.orders%rowtype;
begin
  select * into header from public.orders where id = target for update;
  if header.id is null then perform public.order_fail('not_found'); end if;
  if header.updated_at is distinct from (payload->>'updatedAt')::timestamptz then
    perform public.order_fail('stale_save');
  end if;
  if header.fulfillment <> 'delivery' or header.status not in ('pending', 'confirmed') or header.payment <> 'unpaid' then
    perform public.order_fail('delivery_fee_not_editable');
  end if;
  if fee_mode = 'known' then
    fee := (payload->>'deliveryFeeCentavos')::integer;
    if fee is null or fee < 0 or header.subtotal_centavos::bigint + fee > 2147483647 then
      perform public.order_fail('validation');
    end if;
  elsif fee_mode is distinct from 'rider' then
    perform public.order_fail('validation');
  end if;

  update public.orders
  set delivery_fee_mode = fee_mode,
      delivery_fee_centavos = fee,
      total_centavos = subtotal_centavos + coalesce(fee, 0)
  where id = target
  returning * into header;

  return jsonb_build_object(
    'id', header.id, 'updatedAt', header.updated_at, 'deliveryFeeMode', header.delivery_fee_mode,
    'deliveryFeeCentavos', header.delivery_fee_centavos, 'totalCentavos', header.total_centavos
  );
end;
$$;

revoke all on function public.set_delivery_fee(jsonb) from public, anon, authenticated, service_role;

create or replace function public.apply_order_change(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or action is null then
    perform public.order_fail('validation');
  end if;
  result := case action
    when 'place_order' then public.place_order(payload)
    when 'update_order' then public.update_order(payload)
    when 'transition_order' then public.transition_order(payload)
    when 'set_delivery_fee' then public.set_delivery_fee(payload)
    else null
  end;
  if result is null then perform public.order_fail('validation'); end if;
  return result;
end;
$$;

revoke all on function public.apply_order_change(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_order_change(text, jsonb) to service_role;
