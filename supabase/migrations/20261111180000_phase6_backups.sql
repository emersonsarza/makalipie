-- Phase 6 recovery keys. Only the public recipient is stored.

create table public.backup_keys (
  id uuid primary key default gen_random_uuid(),
  public_key text not null check (public_key ~ '^age1' and char_length(public_key) <= 200),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index backup_keys_single on public.backup_keys ((true));

alter table public.backup_keys enable row level security;
revoke all on table public.backup_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.backup_keys to service_role;
