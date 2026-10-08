-- 0001 — Schema `trafego`: contas de anúncio, métricas diárias, saldo e log da coleta.
--
-- POR QUÊ NESTE BANCO: o dashboard usa o Supabase do Carteira para reaproveitar os
-- usuários e o papel admin/gestor (ver BRIEFING, seção 4, e a decisão
-- organizacao/Decisions/2026-10-08-dashboard-trafego-supabase-compartilhado.md).
-- Schema próprio para não misturar com as tabelas do Carteira, que o gestor não lê.
--
-- PRÉ-REQUISITO: a 0007_papeis.sql do Carteira aplicada (cria public.user_roles e
-- public.is_admin()). Sem ela esta migration falha nas policies, e isso é proposital.
--
-- QUEM ESCREVE: as tabelas de DADOS (campanhas, metricas_diarias, saldo_conta,
-- sync_log, alerta_saldo) só recebem escrita da coleta e do n8n, via service_role.
-- O app só lê. As de CONFIGURAÇÃO (clientes, contas_anuncio, acesso_conta,
-- relatorio_config) o admin edita pela tela.
--
-- DEPOIS DE APLICAR: em Settings → API → "Exposed schemas", adicionar `trafego`.
-- Sem isso o supabase-js não enxerga o schema (erro "schema must be one of...").
--
-- Aplicar à mão no SQL Editor. Nunca `supabase db push`.

create schema if not exists trafego;

-- ── Configuração ────────────────────────────────────────────────────────────

-- Não referencia public.clientes do Carteira: o gestor não pode ler aquela tabela,
-- e um FK para ela faria o dashboard depender dela.
create table trafego.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table trafego.contas_anuncio (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('meta', 'google')),
  -- ID nativo: Meta sem o prefixo "act_"; Google com 10 dígitos, sem hífen.
  conta_id text not null,
  nome text not null,
  cliente_id uuid references trafego.clientes on delete set null,
  moeda text not null default 'BRL',
  fuso text not null default 'America/Sao_Paulo',
  -- Nulo = sem alerta de saldo para esta conta.
  limite_alerta_saldo numeric(12,2),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (plataforma, conta_id),
  check (plataforma <> 'google' or conta_id ~ '^\d{10}$')
);

-- Quais contas cada gestor vê. Admin vê tudo e não precisa de linha aqui.
create table trafego.acesso_conta (
  user_id uuid not null references auth.users on delete cascade,
  conta_anuncio_id uuid not null references trafego.contas_anuncio on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, conta_anuncio_id)
);

-- Por conta: o que entra no relatório de segunda. Array nulo = tudo.
create table trafego.relatorio_config (
  conta_anuncio_id uuid primary key references trafego.contas_anuncio on delete cascade,
  incluir boolean not null default true,
  campanhas text[],   -- campanha_id nativos
  metricas text[],    -- nomes das colunas de metricas_diarias
  atualizado_em timestamptz not null default now()
);

-- ── Dados (só a coleta escreve) ─────────────────────────────────────────────

create table trafego.campanhas (
  conta_anuncio_id uuid not null references trafego.contas_anuncio on delete cascade,
  campanha_id text not null,
  nome text not null,
  status text,
  objetivo text,
  atualizado_em timestamptz not null default now(),
  primary key (conta_anuncio_id, campanha_id)
);

-- Uma linha por campanha por dia. `data` no fuso da conta.
-- A coleta reprocessa os últimos 7 dias com upsert nesta PK.
-- alcance e frequencia ficam nulos no Google: a plataforma não expõe no nível de
-- campanha comum, e nulo (exibido como "—") é diferente de zero.
-- leads/conversas são numeric porque as conversões do Google podem ser fracionadas.
create table trafego.metricas_diarias (
  conta_anuncio_id uuid not null,
  campanha_id text not null,
  data date not null,
  investimento numeric(12,2) not null default 0,
  impressoes bigint not null default 0,
  alcance bigint,
  frequencia numeric(8,4),
  cliques bigint not null default 0,
  ctr numeric(8,4),          -- em %, como a plataforma devolve
  cpc numeric(12,4),
  cpm numeric(12,4),
  leads numeric(12,2),
  conversas numeric(12,2),
  -- Resposta original: permite criar métricas novas sem coletar de novo.
  bruto jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (conta_anuncio_id, campanha_id, data),
  foreign key (conta_anuncio_id, campanha_id)
    references trafego.campanhas (conta_anuncio_id, campanha_id) on delete cascade
);

create index metricas_diarias_data on trafego.metricas_diarias (data);

-- Foto diária do saldo. `fonte` diz de qual campo veio, porque varia por tipo de
-- pagamento (BRIEFING, seção 7): spend_cap_menos_gasto, account_budget,
-- funding_source_details, ritmo_gasto... Saldo nulo = a API não informou.
create table trafego.saldo_conta (
  conta_anuncio_id uuid not null references trafego.contas_anuncio on delete cascade,
  data date not null,
  saldo numeric(12,2),
  tipo_pagamento text,
  fonte text not null,
  bruto jsonb not null default '{}',
  coletado_em timestamptz not null default now(),
  primary key (conta_anuncio_id, data)
);

-- Cada execução da coleta, por conta. conta_anuncio_id nulo = falha geral
-- (ex.: token inválido antes de chegar a qualquer conta).
create table trafego.sync_log (
  id bigint generated always as identity primary key,
  plataforma text check (plataforma in ('meta', 'google')),
  conta_anuncio_id uuid references trafego.contas_anuncio on delete set null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  linhas integer,
  erro text
);

create index sync_log_inicio on trafego.sync_log (inicio desc);

-- Avisos de saldo enviados pelo n8n. A PK garante no máximo um por conta por dia:
-- o n8n faz insert ... on conflict do nothing e só envia se inseriu.
create table trafego.alerta_saldo (
  conta_anuncio_id uuid not null references trafego.contas_anuncio on delete cascade,
  data date not null,
  saldo numeric(12,2),
  limite numeric(12,2),
  enviado_em timestamptz not null default now(),
  primary key (conta_anuncio_id, data)
);

-- ── Quem vê o quê ───────────────────────────────────────────────────────────

-- SECURITY DEFINER: lê acesso_conta ignorando a RLS dela. Assim as policies não
-- fazem subquery numa tabela com RLS própria (recursão e custo por linha).
create function trafego.minhas_contas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select conta_anuncio_id from trafego.acesso_conta where user_id = auth.uid();
$$;

revoke execute on function trafego.minhas_contas() from public, anon;
grant execute on function trafego.minhas_contas() to authenticated;

alter table trafego.clientes enable row level security;
alter table trafego.contas_anuncio enable row level security;
alter table trafego.acesso_conta enable row level security;
alter table trafego.relatorio_config enable row level security;
alter table trafego.campanhas enable row level security;
alter table trafego.metricas_diarias enable row level security;
alter table trafego.saldo_conta enable row level security;
alter table trafego.sync_log enable row level security;
alter table trafego.alerta_saldo enable row level security;

-- Configuração: admin faz tudo; gestor só lê o que é das contas dele.
create policy "admin total" on trafego.clientes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gestor le clientes das suas contas" on trafego.clientes
  for select to authenticated using (
    id in (select cliente_id from trafego.contas_anuncio
           where id in (select trafego.minhas_contas())));

create policy "admin total" on trafego.contas_anuncio
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gestor le suas contas" on trafego.contas_anuncio
  for select to authenticated using (id in (select trafego.minhas_contas()));

create policy "admin total" on trafego.acesso_conta
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gestor le proprio acesso" on trafego.acesso_conta
  for select to authenticated using (user_id = auth.uid());

create policy "admin total" on trafego.relatorio_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Dados: só leitura pelo app. Nenhuma policy de escrita: a coleta usa service_role,
-- que ignora RLS.
create policy "le campanhas" on trafego.campanhas
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));
create policy "le metricas" on trafego.metricas_diarias
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));
create policy "le saldo" on trafego.saldo_conta
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));
create policy "le sync_log" on trafego.sync_log
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));
create policy "le alertas" on trafego.alerta_saldo
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));

-- ── GRANTs ──────────────────────────────────────────────────────────────────
-- RLS restringe linhas; GRANT libera a tabela. Sem os dois, nada passa
-- (a lição das 0005/0006 do Carteira). Explícito, tabela por tabela, de propósito:
-- nada de "grant ... on all tables", para uma tabela nova não nascer aberta.

grant usage on schema trafego to authenticated, service_role;

grant select, insert, update, delete on
  trafego.clientes, trafego.contas_anuncio, trafego.acesso_conta, trafego.relatorio_config
  to authenticated;

grant select on
  trafego.campanhas, trafego.metricas_diarias, trafego.saldo_conta,
  trafego.sync_log, trafego.alerta_saldo
  to authenticated;

grant all on all tables in schema trafego to service_role;
grant usage on all sequences in schema trafego to service_role;
