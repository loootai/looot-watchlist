#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (initdb, pg_ctl, psql on PATH) with a
# stand-in auth schema, then checks that row level security keeps users apart. Deletes the cluster after.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$(mktemp -d)"
port="${PGPORT_TEST:-55439}"
cleanup() { pg_ctl -D "$dir/db" stop -m fast >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
initdb -D "$dir/db" -U postgres -A trust >/dev/null
pg_ctl -D "$dir/db" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$dir/log" -w start >/dev/null
p() { psql -X -q -h 127.0.0.1 -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
p -f "$root/supabase/tests/auth_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do p -f "$f"; done
out="$(p -At -f "$root/supabase/tests/rls_check.sql" 2>&1)"
echo "$out"
expected=$'user2 sees accounts|0\nuser2 sees signals|0\nuser2 updated|0'
[[ "$out" == *"$expected"* && "$out" == *"spoofed owner_id refused by RLS"* && "$out" == *"user1 sees accounts|1"* ]] || { echo "RLS check FAILED"; exit 1; }
echo "RLS check passed"
