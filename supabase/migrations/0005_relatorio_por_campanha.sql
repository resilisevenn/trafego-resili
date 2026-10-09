-- 0005 — Relatório de segunda com um bloco por campanha.
--
-- POR QUÊ (09/10/2026): na conta Meta do Dr. Arlan, a campanha de Leads/WhatsApp e
-- a de audiência (VP INSTA) saíam somadas num bloco só. Objetivos diferentes não
-- se somam: o CPL e o CTR viravam uma média que não serve a nenhuma das duas.
--
-- O QUE MUDA em relatorio_semanal() (mesmo retorno, nenhum dado alterado):
--   • Conta com 2+ campanhas com dado no período: um bloco por campanha (nome sem
--     as tags entre colchetes) e, no fim, o total investido na conta.
--     Com 1 campanha: bloco único, como antes.
--   • Leads, conversas e seus custos só aparecem quando há valor > 0: campanha de
--     audiência não ganha linha de "Leads: 0".
--   • Conversas ganham linha própria (💬). Cliques trocam 🖱 por 👆 (o 🖱 virava
--     quadrado em branco no WhatsApp).
--   • "vs. semana anterior" só aparece se houver semana anterior para comparar.
--   • Sem saldo, a linha fica "💳 Saldo da conta: —" (antes: "— (sem saldo pela API)").
--
-- Aplicar à mão. Pré-requisito: 0001 a 0004.

begin;

-- Códigos internos curtos ([R7], [TRAF], [ENG]: até 4 maiúsculas/dígitos) saem;
-- as demais tags perdem só os colchetes, porque dizem o que a campanha é.
-- "[R7] [Leads] [Captação] [WhatsApp] 25/09/2026" → "Leads Captação WhatsApp 25/09/2026".
-- Se sobrar vazio (nome só de códigos), fica o nome original.
create or replace function trafego.nome_curto(nome text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(btrim(regexp_replace(regexp_replace(
      regexp_replace(nome, '\[[A-Z0-9]{1,4}\]', '', 'g'),
      '\[([^\]]*)\]', '\1', 'g'), '\s+', ' ', 'g')), ''),
    nome);
$$;

-- Linhas de métricas de um conjunto (campanha ou conta). Taxas recalculadas dos totais.
-- _b = semana anterior, só para a variação do investimento e dos leads.
create or replace function trafego.linhas_metricas(
  plataforma text, quer text[],
  inv numeric, inv_b numeric, imp numeric, alc numeric, cli numeric,
  lea numeric, lea_b numeric, con numeric)
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
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n🎯 ' || linha; end if;

  partes := array[]::text[];
  if 'conversas' = any (quer) and con > 0 then partes := partes || ('Conversas: ' || trafego.fmt_num(con, 0)); end if;
  if 'custo_conversa' = any (quer) and con > 0 then partes := partes || ('Custo/conversa ' || trafego.fmt_brl(inv / con)); end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n💬 ' || linha; end if;

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
        array['investimento','impressoes','alcance','frequencia','cliques','ctr','cpc','cpm','leads','cpl','conversas','custo_conversa']);

      -- Totais da conta: atual (sem sufixo) e semana anterior (_b).
      select
        sum(m.investimento) filter (where m.data >= de) as inv,
        sum(m.investimento) filter (where m.data < de) as inv_b,
        sum(m.impressoes) filter (where m.data >= de) as imp,
        sum(m.alcance) filter (where m.data >= de) as alc,
        sum(m.cliques) filter (where m.data >= de) as cli,
        sum(m.leads) filter (where m.data >= de) as lea,
        sum(m.leads) filter (where m.data < de) as lea_b,
        sum(m.conversas) filter (where m.data >= de) as con
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
            sum(m.conversas) filter (where m.data >= de) as con
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
            || trafego.linhas_metricas(a.plataforma, quer, k.inv, k.inv_b, k.imp, k.alc, k.cli, k.lea, k.lea_b, k.con)
            || E'\n';
        end loop;
        bloco := bloco || E'\n💰 *Total da conta: ' || trafego.fmt_brl(coalesce(b.inv, 0)) || '*'
          || trafego.fmt_var(b.inv, b.inv_b);
      else
        bloco := bloco || trafego.linhas_metricas(a.plataforma, quer, b.inv, b.inv_b, b.imp, b.alc, b.cli, b.lea, b.lea_b, b.con);
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
-- As auxiliares são imutáveis e não leem tabela; ficam fechadas como as fmt_*.
revoke execute on function trafego.nome_curto(text) from public, anon, authenticated;
revoke execute on function trafego.linhas_metricas(text, text[], numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

commit;
