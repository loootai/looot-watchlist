-- looot-watchlist schema. Every table has row level security: a user reads and writes only rows
-- where owner_id = auth.uid(). The daily cron uses the service role key and sets owner_id itself.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  domain text not null check (char_length(domain) between 3 and 253),
  role_keywords text[] not null default '{}',
  pages text[] not null default '{}' check (cardinality(pages) <= 5),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, domain)
);

create table public.seen_items (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('news', 'job', 'page')),
  key text not null,
  hash text,
  content text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (account_id, kind, key)
);

create table public.signals (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('news', 'job', 'page')),
  tag text not null,
  title text not null,
  url text,
  detail text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.check_runs (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'cron')),
  accounts_checked int not null default 0,
  runs int not null default 0,
  signals_created int not null default 0,
  estimate_usd numeric(12, 6) not null default 0,
  max_cost_usd numeric(12, 6) not null default 0,
  spent_usd numeric(12, 6) not null default 0,
  stopped_for_budget boolean not null default false,
  errors text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index seen_items_account_idx on public.seen_items (account_id);
create index signals_owner_created_idx on public.signals (owner_id, created_at desc);
create index signals_account_idx on public.signals (account_id);
create index check_runs_owner_created_idx on public.check_runs (owner_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.seen_items enable row level security;
alter table public.signals enable row level security;
alter table public.check_runs enable row level security;

-- One policy per action and table, all scoped to the row owner.
create policy accounts_select on public.accounts for select to authenticated using (owner_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy accounts_delete on public.accounts for delete to authenticated using (owner_id = (select auth.uid()));

create policy seen_items_select on public.seen_items for select to authenticated using (owner_id = (select auth.uid()));
create policy seen_items_insert on public.seen_items for insert to authenticated with check (owner_id = (select auth.uid()));
create policy seen_items_update on public.seen_items for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy seen_items_delete on public.seen_items for delete to authenticated using (owner_id = (select auth.uid()));

create policy signals_select on public.signals for select to authenticated using (owner_id = (select auth.uid()));
create policy signals_insert on public.signals for insert to authenticated with check (owner_id = (select auth.uid()));
create policy signals_update on public.signals for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy signals_delete on public.signals for delete to authenticated using (owner_id = (select auth.uid()));

create policy check_runs_select on public.check_runs for select to authenticated using (owner_id = (select auth.uid()));
create policy check_runs_insert on public.check_runs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy check_runs_delete on public.check_runs for delete to authenticated using (owner_id = (select auth.uid()));
