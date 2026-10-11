-- Kör i Supabase SQL Editor en gång före första synkroniseringen.
-- Bevarar befintliga tabeller och data.
alter table public.customers add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.warehouses add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists extra jsonb not null default '{}'::jsonb;
-- Befintliga RLS-policyer från första installationen måste finnas kvar.
