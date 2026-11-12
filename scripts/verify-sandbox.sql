select check_name, ok
from (
  values
    ('cebu_regular_visible', (select count(*) = 1 from public.locations where id = 'cebu' and kind = 'regular' and visible)),
    ('manila_drop_location', (select count(*) = 1 from public.locations where id = 'manila' and kind = 'drop')),
    ('catalog_seeded', (select count(*) >= 8 from public.products)),
    ('shop_settings', (select count(*) = 1 from public.shop_settings where id = 1)),
    ('owner_allowlisted', (select count(*) >= 1 from public.admin_users)),
    ('orders_table', (to_regclass('public.orders') is not null)),
    ('backup_keys_table', (to_regclass('public.backup_keys') is not null)),
    ('orders_rls', (select relrowsecurity from pg_class where oid = 'public.orders'::regclass)),
    ('apply_order_change', (exists (select 1 from pg_proc where proname = 'apply_order_change'))),
    ('realtime_owner', (exists (select 1 from pg_proc where proname = 'realtime_owner'))),
    ('orders_broadcast_trigger', (exists (select 1 from pg_trigger where tgname = 'orders_broadcast'))),
    ('realtime_owner_policy', (exists (
      select 1 from pg_policies
      where schemaname = 'realtime' and policyname = 'owners_receive_order_broadcasts'
    )))
) as setup(check_name, ok)
order by check_name;
