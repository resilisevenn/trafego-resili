#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica stub + migrations e roda um teste.
#   bash supabase/teste-local/rodar.sh supabase/teste-local/teste_0002.sql
# Requer PostgreSQL instalado (padrão: C:\Program Files\PostgreSQL\17).
set -euo pipefail
PG="${PG_BIN:-/c/Program Files/PostgreSQL/17/bin}"
DIR="$(mktemp -d)"
PORTA=54329
trap '"$PG/pg_ctl" -D "$DIR/pg" -w stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PG/initdb" -D "$DIR/pg" -U postgres -A trust -E UTF8 >/dev/null
"$PG/pg_ctl" -D "$DIR/pg" -o "-p $PORTA" -l "$DIR/log" -w start >/dev/null
P=("$PG/psql" -p $PORTA -U postgres -q -X)
"${P[@]}" -c "create database t" >/dev/null
"${P[@]}" -d t -v ON_ERROR_STOP=1 -f supabase/teste-local/stub_supabase.sql
for m in supabase/migrations/*.sql; do "${P[@]}" -d t -v ON_ERROR_STOP=1 -f "$m"; done
echo "migrations OK"
"${P[@]}" -d t -f "$1"
