#!/usr/bin/env bash
# Junta, NA ORDEM, as migrations do Carteira (0001–0007) e do tráfego (0001–0002)
# num arquivo só, para colar UMA vez no SQL Editor do projeto novo.
#   bash scripts/montar_sql_projeto_novo.sh
# Gera saida/projeto_novo.sql (fora do git: é derivado, as fontes são as migrations).
# Testado com supabase/teste-local/projeto_novo.sh.
set -euo pipefail
CARTEIRA="${CARTEIRA:-../carteira-clientes/supabase/migrations}"
mkdir -p saida
OUT=saida/projeto_novo.sql
{
  echo "-- Gerado por scripts/montar_sql_projeto_novo.sh em $(date '+%d/%m/%Y %H:%M')."
  echo "-- PRÉ-REQUISITO: seu usuário já criado em Authentication → Users (a 0007 do"
  echo "-- Carteira dá o papel admin a contato@resilisevenn.com.br; sem o usuário, ninguém vira admin)."
  echo "-- Roda tudo numa transação: se algo falhar, nada fica pela metade."
  echo "begin;"
  for m in "$CARTEIRA"/*.sql supabase/migrations/*.sql; do
    echo; echo "-- ════════ $m ════════"; cat "$m"
  done
  echo
  echo "-- ════════ perfis de usuários criados ANTES do trigger on_auth_user_created ════════"
  echo "-- Mesma regra do trigger (Carteira 0001). Sem isso, quem foi criado antes fica sem perfil."
  echo "insert into public.profiles (id, nome, email)"
  echo "select u.id, coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)), u.email"
  echo "from auth.users u left join public.profiles p on p.id = u.id where p.id is null;"
  echo; echo "commit;"
} > "$OUT"
echo "Gerado: $OUT ($(wc -l < "$OUT") linhas)"
