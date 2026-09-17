#!/bin/sh
# Runs the schema, the seed and every migration — twice, to prove they can be
# re-run — on a throwaway PostgreSQL, then checks who can read and write what.
#
#   npm run test:db
#
# Needs initdb, pg_ctl and psql on the PATH (PostgreSQL 14 or later). Nothing
# outside a temporary folder is touched, and the folder is removed at the end.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PORT=${TEST_DB_PORT:-54329}

cleanup() {
  pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$WORK/data" -A trust -U postgres >/dev/null
pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/postgres.log" -w start >/dev/null

run() {
  PGOPTIONS="-c client_min_messages=warning" psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X "$@"
}

run -f "$ROOT/supabase/tests/supabase_stub.sql"
run -f "$ROOT/supabase/schema.sql"
run -f "$ROOT/supabase/seed.sql"
for pass in 1 2; do
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    run -f "$migration" >/dev/null
  done
done
run -f "$ROOT/supabase/tests/rls_checks.sql"
echo "Base de dados: esquema, migrações e permissões verificados."
