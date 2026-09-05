-- Supabase schema for production persistence.
-- Yahoo Finance remains the market-data source; Supabase stores user/application state only.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_stocks (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, symbol)
);

create table if not exists public.user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.attention_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  alert_happened_at timestamptz not null,
  viewed_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_stocks enable row level security;
alter table public.user_state enable row level security;
alter table public.attention_views enable row level security;

create policy "profiles are self-owned" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "watchlists are self-owned" on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "watchlist stocks follow watchlist owner" on public.watchlist_stocks
  for all using (
    exists (
      select 1 from public.watchlists
      where watchlists.id = watchlist_stocks.watchlist_id
        and watchlists.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.watchlists
      where watchlists.id = watchlist_stocks.watchlist_id
        and watchlists.user_id = auth.uid()
    )
  );

create policy "user state is self-owned" on public.user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "attention views are self-owned" on public.attention_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
