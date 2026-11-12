create or replace function public.catalog_save_featured(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The table constraint guarantees every saved rank is positive.
  delete from public.featured_products where rank >= 1;
  insert into public.featured_products (product_id, rank)
  select item, ordinality::integer
  from jsonb_array_elements_text(coalesce(payload->'productIds', '[]'::jsonb)) with ordinality as ranked(item, ordinality);
  return '{}'::jsonb;
end;
$$;
