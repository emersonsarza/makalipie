-- Resource hints only. Clients reconcile authoritative data through owner APIs.
create or replace function public.broadcast_admin_data_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into realtime.messages (payload, event, topic, private, extension)
  values (jsonb_build_object('resource', tg_argv[0]), 'change', 'admin-data', true, 'broadcast');
  return null;
end;
$$;
revoke all on function public.broadcast_admin_data_change() from public, anon, authenticated, service_role;

drop trigger if exists storefront_admin_broadcast on public.storefront_revision;
create trigger storefront_admin_broadcast after update on public.storefront_revision
for each statement execute function public.broadcast_admin_data_change('catalog');
drop trigger if exists drops_admin_broadcast on public.drop_revision;
create trigger drops_admin_broadcast after update on public.drop_revision
for each statement execute function public.broadcast_admin_data_change('drops');
drop trigger if exists backups_admin_broadcast on public.backup_keys;
create trigger backups_admin_broadcast after insert or update or delete on public.backup_keys
for each statement execute function public.broadcast_admin_data_change('backups');

drop policy if exists owners_receive_admin_data_broadcasts on realtime.messages;
create policy owners_receive_admin_data_broadcasts on realtime.messages for select to authenticated
using (topic = 'admin-data' and extension = 'broadcast' and public.realtime_owner());
