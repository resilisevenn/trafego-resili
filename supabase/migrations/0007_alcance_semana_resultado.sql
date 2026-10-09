-- 0007 — Alcance real da semana e "Resultado" do Meta no relatório.
--
-- POR QUÊ (09/10/2026):
--   1. Alcance não soma entre dias: quem viu na segunda e na terça contava duas
--      vezes. Dr. Arlan, 02 a 08/10: relatório 17.518 × Gerenciador 12.372 (VP INSTA).
--      A frequência herdava o erro. Agora a coleta pede à Meta o alcance do
--      período inteiro (últimos 7 dias fechados) e guarda em alcance_semana.
--   2. Campanha de tráfego para o Instagram não tem lead nem conversa; o número
--      que importa é o "Resultado" do Gerenciador (ex.: 266 visitas ao perfil).
--      A Meta devolve isso pronto no campo `results` dos insights.
--
-- O QUE MUDA:
--   • metricas_diarias ganha resultado e resultado_tipo (nulos até a próxima coleta).
--   • Tabela nova alcance_semana: uma foto por campanha e janela de 7 dias.
--   • relatorio_semanal() lê o alcance de alcance_semana (sem foto da semana: a
--     linha de alcance some, em vez de mostrar a soma errada) e ganha as métricas
--     'resultado' e 'custo_resultado'. Contas com métricas escolhidas à mão não
--     ganham as novas sozinhas: marca-se na tela.
--   • O painel ainda soma os dias (com aviso na tela); fica para outra etapa.
--
-- Aplicar à mão. Pré-requisito: 0001 a 0006.

begin;

alter table trafego.metricas_diarias
  add column resultado numeric(12,2),
  add column resultado_tipo text;  -- indicador da Meta, ex.: profile_visit_view

-- Alcance de um período fechado, como a Meta calcula (pessoas únicas).
-- Janela = os 7 dias antes do dia da coleta: a coleta de segunda 06h grava
-- exatamente a semana que o relatório das 08h lê.
create table trafego.alcance_semana (
  conta_anuncio_id uuid not null,
  campanha_id text not null,
  inicio date not null,
  fim date not null,
  alcance bigint,
  atualizado_em timestamptz not null default now(),
  primary key (conta_anuncio_id, campanha_id, inicio, fim),
  foreign key (conta_anuncio_id, campanha_id)
    references trafego.campanhas (conta_anuncio_id, campanha_id) on delete cascade
);

alter table trafego.alcance_semana enable row level security;
create policy "le alcance_semana" on trafego.alcance_semana
  for select to authenticated using (
    public.is_admin() or conta_anuncio_id in (select trafego.minhas_contas()));
grant select on trafego.alcance_semana to authenticated;
grant all on trafego.alcance_semana to service_role;

-- "profile_visit_view" → " visitas ao perfil". Indicador desconhecido: sem rótulo
-- (o número sai sozinho, como "Resultados: 266").
create function trafego.rotulo_resultado(tipo text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(' ' || case
    when tipo = 'profile_visit_view' then 'visitas ao perfil'
    when tipo in ('link_click', 'actions:link_click') then 'cliques no link'
    when tipo in ('landing_page_view', 'actions:landing_page_view') then 'visualizações da página'
    when tipo like '%thruplay%' then 'ThruPlays'
    when tipo like '%post_engagement' then 'engajamentos'
    when tipo = 'reach' then 'pessoas alcançadas'
    when tipo like '%messaging_conversation_started%' then 'conversas'
    when tipo like '%lead%' then 'leads'
    when tipo like '%like%' then 'curtidas'
  end, '');
$$;

drop function trafego.linhas_metricas(text, text[], numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);

-- Linhas de métricas de um conjunto (campanha ou conta). Taxas recalculadas dos totais.
-- _b = semana anterior, só para a variação do investimento e dos leads.
create function trafego.linhas_metricas(
  plataforma text, quer text[],
  inv numeric, inv_b numeric, imp numeric, alc numeric, cli numeric,
  lea numeric, lea_b numeric, con numeric, parcela numeric,
  res numeric, res_tipo text)
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

  -- Resultado: o que o Meta conta como resultado do objetivo da campanha.
  partes := array[]::text[];
  if 'resultado' = any (quer) and res > 0 then partes := partes || ('Resultados: ' || trafego.fmt_num(res, 0) || trafego.rotulo_resultado(res_tipo)); end if;
  if 'custo_resultado' = any (quer) and res > 0 then partes := partes || (trafego.fmt_brl(inv / res) || ' por resultado'); end if;
  linha := array_to_string(partes, ' · ');
  if linha <> '' then t := t || E'\n🏁 ' || linha; end if;

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
  alc_conta numeric;
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
              'taxa_conv','parcela_impressoes','resultado','custo_resultado']);

      -- Totais da conta: atual (sem sufixo) e semana anterior (_b).
      select
        sum(m.investimento) filter (where m.data >= de) as inv,
        sum(m.investimento) filter (where m.data < de) as inv_b,
        sum(m.impressoes) filter (where m.data >= de) as imp,
        sum(m.cliques) filter (where m.data >= de) as cli,
        sum(m.leads) filter (where m.data >= de) as lea,
        sum(m.leads) filter (where m.data < de) as lea_b,
        sum(m.conversas) filter (where m.data >= de) as con,
        sum(m.impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as imp_p,
        sum(m.impressoes / m.parcela_impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as pos,
        sum(m.resultado) filter (where m.data >= de) as res,
        case when count(distinct m.resultado_tipo) filter (where m.data >= de) = 1
             then max(m.resultado_tipo) filter (where m.data >= de) end as res_tipo
      into b
      from trafego.metricas_diarias m
      where m.conta_anuncio_id = a.id
        and m.data between de - 7 and ate
        and (a.campanhas is null or m.campanha_id = any (a.campanhas));

      -- Alcance da semana: o da Meta para o período inteiro (alcance_semana), não a
      -- soma dos dias. No bloco único há no máximo 1 campanha com dado, então a
      -- soma abaixo é o alcance dela. Sem a foto da semana: nulo, linha omitida.
      select sum(s.alcance) into alc_conta
      from trafego.alcance_semana s
      where s.conta_anuncio_id = a.id and s.inicio = de and s.fim = ate
        and (a.campanhas is null or s.campanha_id = any (a.campanhas))
        and s.campanha_id in (
          select m.campanha_id from trafego.metricas_diarias m
          where m.conta_anuncio_id = a.id and m.data between de and ate
            and (m.investimento > 0 or m.impressoes > 0));

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
            (select s.alcance from trafego.alcance_semana s
             where s.conta_anuncio_id = a.id and s.campanha_id = cp.campanha_id
               and s.inicio = de and s.fim = ate) as alc,
            sum(m.cliques) filter (where m.data >= de) as cli,
            sum(m.leads) filter (where m.data >= de) as lea,
            sum(m.leads) filter (where m.data < de) as lea_b,
            sum(m.conversas) filter (where m.data >= de) as con,
            sum(m.impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as imp_p,
            sum(m.impressoes / m.parcela_impressoes) filter (where m.data >= de and m.parcela_impressoes > 0) as pos,
            sum(m.resultado) filter (where m.data >= de) as res,
            case when count(distinct m.resultado_tipo) filter (where m.data >= de) = 1
                 then max(m.resultado_tipo) filter (where m.data >= de) end as res_tipo
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
            || trafego.linhas_metricas(a.plataforma, quer, k.inv, k.inv_b, k.imp, k.alc, k.cli, k.lea, k.lea_b, k.con, k.imp_p / nullif(k.pos, 0), k.res, k.res_tipo)
            || E'\n';
        end loop;
        bloco := bloco || E'\n💰 *Total da conta: ' || trafego.fmt_brl(coalesce(b.inv, 0)) || '*'
          || trafego.fmt_var(b.inv, b.inv_b);
      else
        bloco := bloco || trafego.linhas_metricas(a.plataforma, quer, b.inv, b.inv_b, b.imp, alc_conta, b.cli, b.lea, b.lea_b, b.con, b.imp_p / nullif(b.pos, 0), b.res, b.res_tipo);
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
revoke execute on function trafego.rotulo_resultado(text) from public, anon, authenticated;
revoke execute on function trafego.linhas_metricas(text, text[], numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;

commit;
