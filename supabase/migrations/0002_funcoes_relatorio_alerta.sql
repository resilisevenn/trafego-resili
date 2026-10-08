-- 0002 — Funções para a tela de configuração, o relatório de segunda e o alerta de saldo.
--
-- POR QUÊ NO BANCO: o n8n só chama a função e envia o texto que volta. A regra
-- (período, comparação, formato brasileiro, um aviso por dia) fica num lugar só,
-- versionada aqui, em vez de espalhada em nós do n8n.
--
-- QUEM CHAMA:
--   listar_gestores()           → a tela de configuração (admin logado)
--   relatorio_semanal()         → n8n, segunda 8h, com a service_role
--   alertas_saldo_pendentes()   → n8n, diário depois da coleta, com a service_role
--
-- O n8n chama via PostgREST: POST /rest/v1/rpc/<funcao>, com o header
-- "Content-Profile: trafego" (o schema não é o public).
--
-- PRÉ-REQUISITO: 0001_schema_trafego.sql. Aplicar à mão no SQL Editor.

-- ── Gestores (para a tela de configuração) ──────────────────────────────────
-- user_roles só deixa cada um ler o próprio papel (0007 do Carteira). O admin
-- precisa da lista para dar acesso às contas: esta função entrega, mas só a ele.
-- auth.users também não é legível pelo app; daí o SECURITY DEFINER.
create function trafego.listar_gestores()
returns table (user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;
  return query
    select r.user_id, u.email::text
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    where r.role = 'gestor'
    order by u.email;
end;
$$;

revoke execute on function trafego.listar_gestores() from public, anon;
grant execute on function trafego.listar_gestores() to authenticated;

-- ── Formato brasileiro ──────────────────────────────────────────────────────
-- R$ 1.234,56 / 1.234 / 1,25. Nulo vira "—": sem dado não é zero.
create function trafego.fmt_num(v numeric, casas int default 0)
returns text language sql immutable set search_path = '' as $$
  select case when v is null then '—' else
    translate(
      -- Vírgula e ponto LITERAIS no padrão (não G/D, que mudam com lc_numeric);
      -- depois troca um pelo outro para o padrão brasileiro.
      to_char(round(v, casas), 'FM999,999,999,990' || case when casas > 0 then '.' || repeat('0', casas) else '' end),
      ',.', '.,')
  end;
$$;

create function trafego.fmt_brl(v numeric)
returns text language sql immutable set search_path = '' as $$
  select case when v is null then '—' else 'R$ ' || trafego.fmt_num(v, 2) end;
$$;

-- "▲ 12%" / "▼ 3%" / "= 0%". Sem base de comparação: nada.
create function trafego.fmt_var(atual numeric, anterior numeric)
returns text language sql immutable set search_path = '' as $$
  select case
    when atual is null or anterior is null or anterior = 0 then ''
    else ' (' || case when atual > anterior then '▲ ' when atual < anterior then '▼ ' else '= ' end
         || trafego.fmt_num(abs((atual - anterior) / anterior * 100), 0) || '%)'
  end;
$$;

-- ── Relatório de segunda ────────────────────────────────────────────────────
-- Uma linha por CLIENTE (BRIEFING, seção 8: uma mensagem por cliente, para
-- encaminhar fácil), com um bloco por conta de anúncio dele.
-- Período: os 7 dias antes de `ref` (padrão: hoje em Brasília), contra os 7
-- anteriores. Entram as contas ativas, ligadas a cliente, com relatorio_config
-- incluir = true OU sem config (padrão: tudo). campanhas/metricas nulos = todas.
-- Métrica sem dado no período inteiro (ex.: alcance no Google) é omitida do
-- texto, para a mensagem não encher de "—".
create function trafego.relatorio_semanal(ref date default (now() at time zone 'America/Sao_Paulo')::date)
returns table (cliente_id uuid, cliente text, mensagem text)
language plpgsql stable security definer set search_path = '' as $$
declare
  de date := ref - 7;
  ate date := ref - 1;
  c record;
  a record;
  b record;
  bloco text;
  linha text;
  partes text[];
  quer text[];
  saldo_atual numeric;
begin
  for c in
    select distinct cl.id, cl.nome
    from trafego.clientes cl
    join trafego.contas_anuncio ca on ca.cliente_id = cl.id and ca.ativa
    left join trafego.relatorio_config rc on rc.conta_anuncio_id = ca.id
    where cl.ativo and coalesce(rc.incluir, true)
    order by cl.nome
  loop
    mensagem := null;
    for a in
      select ca.id, ca.plataforma, rc.campanhas, rc.metricas
      from trafego.contas_anuncio ca
      left join trafego.relatorio_config rc on rc.conta_anuncio_id = ca.id
      where ca.cliente_id = c.id and ca.ativa and coalesce(rc.incluir, true)
      order by ca.plataforma, ca.nome
    loop
      -- Totais atual (sufixo _a) e anterior (_b). Taxas recalculadas dos totais.
      select
        sum(m.investimento) filter (where m.data >= de) as inv_a,
        sum(m.investimento) filter (where m.data < de) as inv_b,
        sum(m.impressoes) filter (where m.data >= de) as imp_a,
        sum(m.alcance) filter (where m.data >= de) as alc_a,
        sum(m.cliques) filter (where m.data >= de) as cli_a,
        sum(m.leads) filter (where m.data >= de) as lea_a,
        sum(m.leads) filter (where m.data < de) as lea_b,
        sum(m.conversas) filter (where m.data >= de) as con_a
      into b
      from trafego.metricas_diarias m
      where m.conta_anuncio_id = a.id
        and m.data between de - 7 and ate
        and (a.campanhas is null or m.campanha_id = any (a.campanhas));

      quer := coalesce(a.metricas,
        array['investimento','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm','leads','cpl','conversas']);

      select s.saldo into saldo_atual
      from trafego.saldo_conta s
      where s.conta_anuncio_id = a.id
      order by s.data desc limit 1;

      bloco := '*' || c.nome || ' — ' || case a.plataforma when 'meta' then 'Meta Ads' else 'Google Ads' end || '*'
        || E'\n_' || to_char(de, 'DD/MM') || ' a ' || to_char(ate, 'DD/MM') || ' · vs. semana anterior_' || E'\n';

      if 'investimento' = any (quer) then
        bloco := bloco || E'\n💰 Investimento: ' || trafego.fmt_brl(coalesce(b.inv_a, 0)) || trafego.fmt_var(b.inv_a, b.inv_b);
      end if;

      partes := array[]::text[];
      if 'impressoes' = any (quer) then partes := partes || ('Impressões: ' || trafego.fmt_num(coalesce(b.imp_a, 0))); end if;
      if 'alcance' = any (quer) and b.alc_a is not null then partes := partes || ('Alcance: ' || trafego.fmt_num(b.alc_a)); end if;
      if 'frequencia' = any (quer) and b.alc_a > 0 then partes := partes || ('Freq.: ' || trafego.fmt_num(b.imp_a / b.alc_a, 2)); end if;
      linha := array_to_string(partes, ' · ');
      if linha <> '' then bloco := bloco || E'\n👁 ' || linha; end if;

      partes := array[]::text[];
      if 'cliques' = any (quer) then partes := partes || ('Cliques: ' || trafego.fmt_num(coalesce(b.cli_a, 0))); end if;
      if 'ctr' = any (quer) and b.imp_a > 0 then partes := partes || ('CTR ' || trafego.fmt_num(b.cli_a * 100.0 / b.imp_a, 2) || '%'); end if;
      if 'cpc' = any (quer) and b.cli_a > 0 then partes := partes || ('CPC ' || trafego.fmt_brl(b.inv_a / b.cli_a)); end if;
      linha := array_to_string(partes, ' · ');
      if linha <> '' then bloco := bloco || E'\n🖱 ' || linha; end if;

      if 'cpm' = any (quer) and b.imp_a > 0 then
        bloco := bloco || E'\n📊 CPM: ' || trafego.fmt_brl(b.inv_a * 1000 / b.imp_a);
      end if;

      partes := array[]::text[];
      if 'leads' = any (quer) and b.lea_a is not null then partes := partes || (case a.plataforma when 'google' then 'Conversões: ' else 'Leads: ' end || trafego.fmt_num(b.lea_a, 0) || trafego.fmt_var(b.lea_a, b.lea_b)); end if;
      -- CPL só com lead > 0: dividir por zero não é "R$ 0".
      if 'cpl' = any (quer) and b.lea_a > 0 then partes := partes || (case a.plataforma when 'google' then 'Custo/conv. ' else 'CPL ' end || trafego.fmt_brl(b.inv_a / b.lea_a)); end if;
      if 'conversas' = any (quer) and b.con_a is not null then partes := partes || ('Conversas: ' || trafego.fmt_num(b.con_a, 0)); end if;
      linha := array_to_string(partes, ' · ');
      if linha <> '' then bloco := bloco || E'\n🎯 ' || linha; end if;

      bloco := bloco || E'\n\n💳 Saldo da conta: '
        || case when saldo_atual is null then '— (sem saldo pela API)' else trafego.fmt_brl(saldo_atual) end;

      mensagem := case when mensagem is null then bloco else mensagem || E'\n\n' || bloco end;
    end loop;

    if mensagem is not null then
      cliente_id := c.id;
      cliente := c.nome;
      return next;
    end if;
  end loop;
end;
$$;

-- ── Alerta de saldo ─────────────────────────────────────────────────────────
-- Contas com a foto de saldo de HOJE abaixo do limite_alerta_saldo. Registra o
-- aviso em alerta_saldo e só devolve o que acabou de registrar: chamar duas vezes
-- no mesmo dia não manda duas vezes (BRIEFING, seção 9).
-- Limitação aceita: se o envio no n8n falhar DEPOIS desta chamada, o aviso do dia
-- fica marcado como enviado. O n8n deve tratar o erro de envio (ex.: avisar).
create function trafego.alertas_saldo_pendentes()
returns table (conta_anuncio_id uuid, cliente text, conta text, saldo numeric, limite numeric, mensagem text)
language plpgsql volatile security definer set search_path = '' as $$
-- As colunas de saída (saldo, limite...) têm nome igual às da tabela: na dúvida, coluna.
#variable_conflict use_column
begin
  return query
  with candidatos as (
    select ca.id, coalesce(cl.nome, 'Sem cliente') as cliente, ca.nome as conta, ca.plataforma,
           s.saldo, ca.limite_alerta_saldo as limite, s.data
    from trafego.contas_anuncio ca
    join trafego.saldo_conta s
      on s.conta_anuncio_id = ca.id
     and s.data = (now() at time zone ca.fuso)::date
    left join trafego.clientes cl on cl.id = ca.cliente_id
    where ca.ativa
      and ca.limite_alerta_saldo is not null
      and s.saldo is not null
      and s.saldo < ca.limite_alerta_saldo
  ),
  novos as (
    insert into trafego.alerta_saldo (conta_anuncio_id, data, saldo, limite)
    select id, data, saldo, limite from candidatos
    on conflict do nothing
    returning alerta_saldo.conta_anuncio_id
  )
  select k.id, k.cliente, k.conta, k.saldo, k.limite,
         '⚠️ *Saldo baixo — ' || k.cliente || '*'
         || E'\n' || case k.plataforma when 'meta' then 'Meta Ads' else 'Google Ads' end || ' · ' || k.conta
         || E'\n\n💳 Saldo: ' || trafego.fmt_brl(k.saldo)
         || E'\n🔔 Limite de alerta: ' || trafego.fmt_brl(k.limite)
  from candidatos k
  join novos n on n.conta_anuncio_id = k.id
  order by k.cliente, k.conta;
end;
$$;

-- Relatório e alerta: só a service_role (n8n). Nenhum usuário do app chama.
revoke execute on function trafego.relatorio_semanal(date) from public, anon, authenticated;
revoke execute on function trafego.alertas_saldo_pendentes() from public, anon, authenticated;
grant execute on function trafego.relatorio_semanal(date) to service_role;
grant execute on function trafego.alertas_saldo_pendentes() to service_role;
