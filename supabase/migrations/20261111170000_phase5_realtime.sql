-- Phase 5 private order broadcasts. Payloads are hints: order id and change type only.

create or replace function public.realtime_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('makalipie.skip_order_event', true), '') = 'on' then
    return null;
  end if;
  insert into realtime.messages (payload, event, topic, private, extension)
  values (
    jsonb_build_object(
      'orderId', new.id,
      'changeType', case when tg_op = 'INSERT' then 'created' else 'updated' end
    ),
    'order',
    'orders',
    true,
    'broadcast'
  );
  return null;
end;
$$;

drop trigger if exists orders_broadcast on public.orders;
create trigger orders_broadcast
  after insert or update on public.orders
  for each row execute function public.broadcast_order_change();

drop policy if exists owners_receive_order_broadcasts on realtime.messages;
create policy owners_receive_order_broadcasts
  on realtime.messages
  for select
  to authenticated
  using (
    topic = 'orders'
    and extension = 'broadcast'
    and public.realtime_owner()
  );

revoke all on function public.realtime_owner() from public, anon, service_role;
grant execute on function public.realtime_owner() to authenticated;
revoke all on function public.broadcast_order_change() from public, anon, authenticated, service_role;
