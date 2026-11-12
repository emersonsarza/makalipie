-- Excluding an offering stops new orders but still allows existing commitments to be released.
create or replace function public.consume_drop_qty(target_drop text, offering text, service_day date, qty integer)
returns void
language plpgsql
set search_path = public
as $$
declare
  available integer;
  taken integer;
begin
  if qty = 0 then return; end if;
  select allocated, committed into available, taken
  from public.drop_offering_dates
  where drop_id = target_drop and offering_id = offering and service_date = service_day and (included or qty < 0)
  for update;
  if available is null or taken + qty > available or taken + qty < 0 then
    perform public.order_fail('unavailable', jsonb_build_object('offerings', jsonb_build_array(jsonb_build_object(
      'id', offering,
      'remaining', greatest(coalesce(available, 0) - coalesce(taken, 0), 0)
    ))));
  end if;
  update public.drop_offering_dates
  set committed = committed + qty
  where drop_id = target_drop and offering_id = offering and service_date = service_day;
end;
$$;

