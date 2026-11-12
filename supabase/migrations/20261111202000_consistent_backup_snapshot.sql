-- A single SQL statement sees one MVCC snapshot across all backup tables.
create function public.admin_backup_snapshot()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'locations', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.locations as row),
    'menu_sections', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.menu_sections as row),
    'products', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.products as row),
    'product_sizes', (select coalesce(jsonb_agg(to_jsonb(row) order by row.product_id, row.id), '[]'::jsonb) from public.product_sizes as row),
    'product_theme_images', (select coalesce(jsonb_agg(to_jsonb(row) order by row.product_id, row.theme), '[]'::jsonb) from public.product_theme_images as row),
    'size_theme_images', (select coalesce(jsonb_agg(to_jsonb(row) order by row.product_id, row.size_id, row.theme), '[]'::jsonb) from public.size_theme_images as row),
    'size_branch_assignments', (select coalesce(jsonb_agg(to_jsonb(row) order by row.product_id, row.size_id, row.location_id), '[]'::jsonb) from public.size_branch_assignments as row),
    'add_ons', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.add_ons as row),
    'add_on_locations', (select coalesce(jsonb_agg(to_jsonb(row) order by row.add_on_id, row.location_id), '[]'::jsonb) from public.add_on_locations as row),
    'branch_schedules', (select coalesce(jsonb_agg(to_jsonb(row) order by row.location_id), '[]'::jsonb) from public.branch_schedules as row),
    'schedule_date_overrides', (select coalesce(jsonb_agg(to_jsonb(row) order by row.location_id, row.service_date), '[]'::jsonb) from public.schedule_date_overrides as row),
    'shop_settings', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.shop_settings as row),
    'featured_products', (select coalesce(jsonb_agg(to_jsonb(row) order by row.rank), '[]'::jsonb) from public.featured_products as row),
    'popups', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.popups as row),
    'storefront_revision', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.storefront_revision as row),
    'drop_revision', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.drop_revision as row),
    'drops', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb) from public.drops as row),
    'drop_dates', (select coalesce(jsonb_agg(to_jsonb(row) order by row.drop_id, row.service_date), '[]'::jsonb) from public.drop_dates as row),
    'drop_offerings', (select coalesce(jsonb_agg(to_jsonb(row) order by row.drop_id, row.id), '[]'::jsonb) from public.drop_offerings as row),
    'drop_package_components', (select coalesce(jsonb_agg(to_jsonb(row) order by row.drop_id, row.offering_id, row.product_id, row.size_id), '[]'::jsonb) from public.drop_package_components as row),
    'drop_offering_dates', (select coalesce(jsonb_agg(to_jsonb(row) order by row.drop_id, row.offering_id, row.service_date), '[]'::jsonb) from public.drop_offering_dates as row),
    'drop_addons', (select coalesce(jsonb_agg(to_jsonb(row) order by row.drop_id, row.add_on_id), '[]'::jsonb) from public.drop_addons as row),
    'daily_order_sequences', (select coalesce(jsonb_agg(to_jsonb(row) order by row.service_date), '[]'::jsonb) from public.daily_order_sequences as row),
    'orders', (select coalesce(jsonb_agg(to_jsonb(row) || jsonb_build_object('customer_name', null, 'customer_phone', null, 'delivery_address', null, 'notes', null) order by row.id), '[]'::jsonb) from public.orders as row),
    'order_lines', (select coalesce(jsonb_agg(to_jsonb(row) order by row.order_id, row.line_no), '[]'::jsonb) from public.order_lines as row),
    'order_line_components', (select coalesce(jsonb_agg(to_jsonb(row) order by row.line_id, row.product_id, row.size_id), '[]'::jsonb) from public.order_line_components as row),
    'order_addons', (select coalesce(jsonb_agg(to_jsonb(row) order by row.order_id, row.add_on_id), '[]'::jsonb) from public.order_addons as row),
    'order_idempotency', (select coalesce(jsonb_agg(to_jsonb(row) order by row.idempotency_key), '[]'::jsonb) from public.order_idempotency as row)
  );
$$;

revoke all on function public.admin_backup_snapshot() from public, anon, authenticated;
grant execute on function public.admin_backup_snapshot() to service_role;
