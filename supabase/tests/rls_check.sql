-- Row level security check: user 2 must not see, change or forge user 1 rows. Run by scripts/test-rls.sh.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into accounts (name, domain) values ('Acme', 'acme.com');
insert into signals (account_id, kind, tag, title) select id, 'news', 'funding', 'Acme raises' from accounts;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'user2 sees accounts', count(*) from accounts;
select 'user2 sees signals', count(*) from signals;
with u as (update accounts set name = 'x' returning id) select 'user2 updated', count(*) from u;
do $$ begin
  insert into accounts (owner_id, name, domain) values ('11111111-1111-1111-1111-111111111111', 'Spoof', 'spoof.com');
  raise exception 'SPOOF INSERT SUCCEEDED';
exception when insufficient_privilege then raise notice 'spoofed owner_id refused by RLS';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'user1 sees accounts', count(*) from accounts;
select 'user1 sees signals', count(*) from signals;
reset role;
select relname, relrowsecurity from pg_class where relname in ('accounts','seen_items','signals','check_runs') order by 1;
