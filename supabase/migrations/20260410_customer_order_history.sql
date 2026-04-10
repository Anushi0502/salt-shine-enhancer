create table if not exists public.customer_order_history (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('cart', 'buy-now')),
  checkout_url text not null default '',
  item_count integer not null default 0 check (item_count >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_order_history_user_created_at_idx
  on public.customer_order_history (user_id, created_at desc);

alter table public.customer_order_history enable row level security;

drop policy if exists "customer order history select own" on public.customer_order_history;
create policy "customer order history select own"
on public.customer_order_history
for select
using (auth.uid() = user_id);

drop policy if exists "customer order history insert own" on public.customer_order_history;
create policy "customer order history insert own"
on public.customer_order_history
for insert
with check (auth.uid() = user_id);

drop policy if exists "customer order history update own" on public.customer_order_history;
create policy "customer order history update own"
on public.customer_order_history
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "customer order history delete own" on public.customer_order_history;
create policy "customer order history delete own"
on public.customer_order_history
for delete
using (auth.uid() = user_id);
