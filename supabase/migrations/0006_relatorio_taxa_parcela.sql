-- 0006 — Taxa de conversão e parcela de impressões no relatório (Google).
--
-- POR QUÊ (09/10/2026): em campanha de pesquisa o CPM sai alto e não diz nada
-- (poucas impressões). O que importa é se o clique vira contato (taxa de conversão)
-- e quanto do público possível a campanha pegou (parcela de impressões). O painel
-- já calcula as duas; o relatório passa a ter.
--
-- O QUE MUDA:
--   • Métricas novas 'taxa_conv' (conversões ÷ cliques, só Google) e
--     'parcela_impressoes' (só Google; ponderada por impressões como no painel:
--     impressões ÷ impressões possíveis, não média simples das frações).
--   • linhas_metricas() ganha o parâmetro da parcela: a assinatura muda, então a
--     versão da 0005 é removida.
--   • Contas com lista de métricas escolhida à mão NÃO ganham as novas sozinhas
--     (mesma regra da 0004): marca-se na tela. Nenhum dado é alterado.
--
-- Aplicar à mão. Pré-requisito: 0001 a 0005.

begin;

drop function trafego.linhas_metricas(text, text[], numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);

-- Linhas de métricas de um conjunto (campanha ou conta). Taxas recalculadas dos totais.
-- _b = semana anterior, só para a variação do investimento e dos leads.
create function trafego.linhas_metricas(
  plataforma text, quer text[],
  inv numeric, inv_b numeric, imp numeric, alc numeric, cli numeric,
  lea numeric, lea_b numeric, con numeric, parcela numeric)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t text := '';
  partes text[];
  linha text;
begin
  if 'investimento' = any (quer) then
    t := t || E'\n💰 Investimento: ' || trafego.fmt_brl(coalesce(inv, 0)) || trafego.fmt_var(inv, inv_b);
  end if;

  partes := array[]::text[];
  if 'impressoes' = any (quer) then partes := partes || ('Impressões: ' || trafego.fmt_num(coalesce(imp, 0))); end if;
  if 'alcance' = any (quer) and alc is not null then partes := partes || ('Alcance: ' || trafego.fmt_num(alc)); end if;
  if 'frequencia' = any (quer) and alc > 0 then partes := partes || ('Freq.: ' || trafego.fmt_num(imp / alc, 2)); end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n👁 ' || linha; end if;

  partes := array[]::text[];
  if 'cliques' = any (quer) then partes := partes || ('Cliques: ' || trafego.fmt_num(coalesce(cli, 0))); end if;
  if 'ctr' = any (quer) and imp > 0 then partes := partes || ('CTR ' || trafego.fmt_num(cli * 100.0 / imp, 2) || '%'); end if;
  if 'cpc' = any (quer) and cli > 0 then partes := partes || ('CPC ' || trafego.fmt_brl(inv / cli)); end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n👆 ' || linha; end if;

  if 'cpm' = any (quer) and imp > 0 then
    t := t || E'\n📊 CPM: ' || trafego.fmt_brl(inv * 1000 / imp);
  end if;

  partes := array[]::text[];
  if 'leads' = any (quer) and lea > 0 then partes := partes || (case plataforma when 'google' then 'Conversões: ' else 'Leads: ' end || trafego.fmt_num(lea, 0) || trafego.fmt_var(lea, lea_b)); end if;
  if 'cpl' = any (quer) and lea > 0 then partes := partes || (case plataforma when 'google' then 'Custo/conv. ' else 'CPL ' end || trafego.fmt_brl(inv / lea)); end if;
  -- Só Google: no Meta, "lead ÷ clique" mistura clique no link com lead de formulário.
  if 'taxa_conv' = any (quer) and plataforma = 'google' and lea > 0 and cli > 0 then
    partes := partes || ('Taxa de conv. ' || trafego.fmt_num(lea * 100.0 / cli, 0) || '%');
  end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n🎯 ' || linha; end if;

  partes := array[]::text[];
  if 'conversas' = any (quer) and con > 0 then partes := partes || ('Conversas: ' || trafego.fmt_num(con, 0)); end if;
  if 'custo_conversa' = any (quer) and con > 0 then partes := partes || ('Custo/conversa ' || trafego.fmt_brl(inv / con)); end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n💬 ' || linha; end if;

  if 'parcela_impressoes' = any (quer) and parcela is not null then
    t := t || E'\n📈 Parcela de impressões: ' || trafego.fmt_num(parcela * 100, 0) || '%';
  end if;

  return t;
end;
$$;

create or replace function trafego.relatorio_semanal(ref date default (now() at time zone 'America/Sao_Paulo')::date)
returns table (cliente_id uuid, cliente text, mensagem text)
language plpgsql stable security definer set search_path = '' as $$
declare
  de date := ref - 7;
  ate date := ref - 1;
  c record;
  a record;
  b record;
  k record;
  n_camp int;
  bloco text;
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
      quer := coalesce(a.metricas,
        array['investimento','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm','leads','cpl','conversas','custo_conversa',
              'taxa_conv','parcela_impressoes']);

      -- Totais da conta: atual (sem sufixo) e semana anterior (_b).
      select
        sum(m.investimento) filter (where m.data >= de) as inv,
        sum(m.investimento) filter (where m.data < de) as inv_b,
        sum(m.impressoes) filter (where m.data >= de) as imp,
        sum(m.alcance) filter (where m.data >= de) as alc,
        sum(m.cliques) filter (where m.data >= de) as cli,
        sum(m.leads) filter (where m.data >= de) as lea,
        sum(m.leads) filter (where m.data < de) as lea_b,
        sum(m.conversas) filter (where m.data >= de) as con,
        sum(m.impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as imp_p,
        sum(m.impressoes / m.parcela_impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as pos
      into b
      from trafego.metricas_diarias m
      where m.conta_anuncio_id = a.id
        and m.data between de - 7 and ate
        and (a.campanhas is null or m.campanha_id = any (a.campanhas));

      -- Campanhas com algum dado no período atual.
      select count(distinct m.campanha_id) into n_camp
      from trafego.metricas_diarias m
      where m.conta_anuncio_id = a.id
        and m.data between de and ate
        and (m.investimento > 0 or m.impressoes > 0)
        and (a.campanhas is null or m.campanha_id = any (a.campanhas));

      select s.saldo into saldo_atual
      from trafego.saldo_conta s
      where s.conta_anuncio_id = a.id
      order by s.data desc limit 1;

      bloco := '*' || c.nome || ' — ' || case a.plataforma when 'meta' then 'Meta Ads' else 'Google Ads' end || '*'
        || E'\n_' || to_char(de, 'DD/MM') || ' a ' || to_char(ate, 'DD/MM')
        || case when b.inv_b > 0 then ' · vs. semana anterior' else '' end || '_' || E'\n';

      if n_camp > 1 then
        for k in
          select cp.nome,
            sum(m.investimento) filter (where m.data >= de) as inv,
            sum(m.investimento) filter (where m.data < de) as inv_b,
            sum(m.impressoes) filter (where m.data >= de) as imp,
            sum(m.alcance) filter (where m.data >= de) as alc,
            sum(m.cliques) filter (where m.data >= de) as cli,
            sum(m.leads) filter (where m.data >= de) as lea,
            sum(m.leads) filter (where m.data < de) as lea_b,
            sum(m.conversas) filter (where m.data >= de) as con,
            sum(m.impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as imp_p,
            sum(m.impressoes / m.parcela_impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as pos
          from trafego.metricas_diarias m
          join trafego.campanhas cp on cp.conta_anuncio_id = m.conta_anuncio_id and cp.campanha_id = m.campanha_id
          where m.conta_anuncio_id = a.id
            and m.data between de - 7 and ate
            and (a.campanhas is null or m.campanha_id = any (a.campanhas))
          group by cp.campanha_id, cp.nome
          having sum(m.investimento) filter (where m.data >= de) > 0
              or sum(m.impressoes) filter (where m.data >= de) > 0
          order by sum(m.investimento) filter (where m.data >= de) desc nulls last
        loop
          bloco := bloco || E'\n▸ *' || trafego.nome_curto(k.nome) || '*'
            || trafego.linhas_metricas(a.plataforma, quer, k.inv, k.inv_b, k.imp, k.alc, k.cli, k.lea, k.lea_b, k.con, k.imp_p / nullif(k.pos, 0))
            || E'\n';
        end loop;
        bloco := bloco || E'\n💰 *Total da conta: ' || trafego.fmt_brl(coalesce(b.inv, 0)) || '*'
          || trafego.fmt_var(b.inv, b.inv_b);
      else
        bloco := bloco || trafego.linhas_metricas(a.plataforma, quer, b.inv, b.inv_b, b.imp, b.alc, b.cli, b.lea, b.lea_b, b.con, b.imp_p / nullif(b.pos, 0));
      end if;

      -- fmt_brl(null) = "—": sem saldo pela API, a linha fica só com o traço.
      bloco := bloco || E'\n\n💳 Saldo da conta: ' || trafego.fmt_brl(saldo_atual);

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
revoke execute on function trafego.linhas_metricas(text, text[], numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

commit;
