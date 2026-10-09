#!/usr/bin/env bash
# Simula o PROJETO NOVO do Supabase: banco vazio + Carteira (0001–0007) +
# tráfego (0001–0002), na ordem em que vão ser aplicadas no SQL Editor.
#   bash supabase/teste-local/projeto_novo.sh [teste.sql]
set -euo pipefail
PG="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
CARTEIRA="${CARTEIRA:-../carteira-clientes/supabase/migrations}"
DIR="$(mktemp -d)"; PORTA=54330
trap '"$PG/pg_ctl" -D "$DIR/pg" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PG/initdb" -D "$DIR/pg" -U postgres -A trust -E UTF8 >/dev/null
"$PG/pg_ctl" -D "$DIR/pg" -o "-p $PORTA" -l "$DIR/log" -w start >/dev/null
P=("$PG/psql" -p $PORTA -U postgres -q -X -v ON_ERROR_STOP=1)
"${P[@]}" -c "create database t" >/dev/null
"${P[@]}" -d t -f supabase/teste-local/stub_base.sql
for m in "$CARTEIRA"/*.sql supabase/migrations/*.sql; do
  echo "aplicando $(basename "$(dirname "$(dirname "$(dirname "$m")")")")/$(basename "$m")"
  "${P[@]}" -d t -f "$m"
done
echo "TODAS AS MIGRATIONS OK"
[ $# -gt 0 ] && "$PG/psql" -p $PORTA -U postgres -q -X -d t -f "$1"
exit 0
