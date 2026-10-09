-- 0004 — Custo por conversa no relatório de segunda.
--
-- POR QUÊ (09/10/2026): três contas Meta rodam campanhas de MENSAGEM (Dra Isadora,
-- Dr. Anderson, RVF - R7). Nelas não há lead, então o CPL fica vazio; o custo que
-- importa é o custo por conversa. O dashboard já mostra; o relatório passa a mostrar.
--
-- O QUE MUDA: relatorio_semanal() ganha a métrica 'custo_conversa' (padrão: entra).
-- Contas com lista de métricas escolhida à mão (relatorio_config.metricas não nulo)
-- NÃO ganham a métrica sozinhas: a escolha feita é respeitada; marca-se na tela.
-- Só a função muda (create or replace, mesmo retorno): nenhum dado é alterado.
--
-- Aplicar à mão. Pré-requisito: 0001, 0002, 0003.

begin;

create or replace function trafego.relatorio_semanal(ref date default (now() at time zone 'America/Sao_Paulo')::date)
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
        array['investimento','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm','leads','cpl','conversas','custo_conversa']);

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
      -- Custo por conversa (contas de mensagem). Só com conversa > 0.
      if 'custo_conversa' = any (quer) and b.con_a > 0 then partes := partes || ('Custo/conversa ' || trafego.fmt_brl(b.inv_a / b.con_a)); end if;
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

-- create or replace preserva os grants da 0002 (só service_role executa).

commit;
