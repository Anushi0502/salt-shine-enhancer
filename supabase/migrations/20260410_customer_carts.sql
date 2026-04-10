create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.customer_carts enable row level security;

drop policy if exists "customer carts select own" on public.customer_carts;
create policy "customer carts select own"
on public.customer_carts
for select
using (auth.uid() = user_id);

drop policy if exists "customer carts insert own" on public.customer_carts;
create policy "customer carts insert own"
on public.customer_carts
for insert
with check (auth.uid() = user_id);

drop policy if exists "customer carts update own" on public.customer_carts;
create policy "customer carts update own"
on public.customer_carts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "customer carts delete own" on public.customer_carts;
create policy "customer carts delete own"
on public.customer_carts
for delete
using (auth.uid() = user_id);
