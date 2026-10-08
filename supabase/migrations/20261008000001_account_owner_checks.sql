-- seen_items and signals rows must point at an account the same user owns.
drop policy seen_items_insert on public.seen_items;
drop policy seen_items_update on public.seen_items;
drop policy signals_insert on public.signals;

create policy seen_items_insert on public.seen_items for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.accounts a where a.id = account_id and a.owner_id = (select auth.uid()))
);
create policy seen_items_update on public.seen_items for update to authenticated using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.accounts a where a.id = account_id and a.owner_id = (select auth.uid()))
);
create policy signals_insert on public.signals for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.accounts a where a.id = account_id and a.owner_id = (select auth.uid()))
);
