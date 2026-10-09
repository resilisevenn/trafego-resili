-- 0003 — Alerta de saldo por DIAS, não por reais; teto guardado na foto de saldo.
--
-- POR QUÊ (decisão de 09/10/2026, Jackson): um limite fixo em reais engana.
-- R$ 106 numa conta que gasta R$ 10/dia é folga de 10 dias; numa que gasta
-- R$ 100/dia, é 1 dia. A pergunta que importa é "em quantos dias os anúncios
-- param?": saldo ÷ gasto médio dos últimos 7 dias. Vale igual para o crédito
-- pré-pago (boleto/Pix) e para o teto de gastos de conta no cartão.
--
-- O QUE MUDA:
--   contas_anuncio.limite_alerta_saldo (R$)  →  contas_anuncio.alerta_saldo_dias
--   saldo_conta ganha `teto` (o limite de gastos / orçamento aprovado), para o
--     painel mostrar "% usado" sem reabrir o jsonb.
--   alerta_saldo troca `limite` (R$) por `dias` (a projeção no momento do aviso).
--   alertas_saldo_pendentes() passa a disparar por dias.
--
-- MIGRAÇÃO DOS VALORES: os 3 limites salvos em 09/10 equivaliam a 3 dias de
-- verba; a conversão abaixo (limite ÷ verba/30, arredondado, de 1 a 30) os leva
-- para 3. Sem verba, fica o padrão (3).
--
-- Aplicar à mão (psql ou SQL Editor). Pré-requisito: 0001 e 0002.

begin;

alter table trafego.contas_anuncio
  add column alerta_saldo_dias int not null default 3
  check (alerta_saldo_dias between 1 and 30);

update trafego.contas_anuncio
set alerta_saldo_dias = least(30, greatest(1, round(limite_alerta_saldo / (verba_mensal / 30))))
where limite_alerta_saldo is not null and verba_mensal > 0;

alter table trafego.contas_anuncio drop column limite_alerta_saldo;

-- Teto de gastos (Meta, cartão) ou orçamento aprovado (Google). Nulo no
-- pré-pago e na conta sem teto.
alter table trafego.saldo_conta add column teto numeric(12,2);

alter table trafego.alerta_saldo drop column limite;
alter table trafego.alerta_saldo add column dias numeric(6,1);

-- O tipo de retorno muda: precisa de drop antes do create.
drop function trafego.alertas_saldo_pendentes();

-- Contas cujo saldo de HOJE dura menos que alerta_saldo_dias no ritmo dos
-- últimos 7 dias (até ontem, no fuso da conta). Registra o aviso e só devolve
-- o que acabou de registrar: no máximo um por conta por dia.
-- Conta sem gasto nos 7 dias não alerta (não dá para projetar).
-- Limitação mantida da 0002: se o envio no n8n falhar depois desta chamada,
-- o aviso do dia fica marcado como enviado.
create function trafego.alertas_saldo_pendentes()
returns table (conta_anuncio_id uuid, cliente text, conta text, saldo numeric, dias numeric, mensagem text)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with base as (
    select ca.id, coalesce(cl.nome, 'Sem cliente') as cliente, ca.nome as conta, ca.plataforma,
           ca.alerta_saldo_dias, s.saldo, s.tipo_pagamento, s.data,
           (select sum(m.investimento) / 7
              from trafego.metricas_diarias m
             where m.conta_anuncio_id = ca.id
               and m.data between s.data - 7 and s.data - 1) as media_diaria
    from trafego.contas_anuncio ca
    join trafego.saldo_conta s
      on s.conta_anuncio_id = ca.id
     and s.data = (now() at time zone ca.fuso)::date
    left join trafego.clientes cl on cl.id = ca.cliente_id
    where ca.ativa and s.saldo is not null
  ),
  candidatos as (
    select b.*, round(b.saldo / b.media_diaria, 1) as dias
    from base b
    where b.media_diaria > 0 and b.saldo / b.media_diaria < b.alerta_saldo_dias
  ),
  novos as (
    insert into trafego.alerta_saldo (conta_anuncio_id, data, saldo, dias)
    select id, data, saldo, dias from candidatos
    on conflict do nothing
    returning alerta_saldo.conta_anuncio_id
  )
  select k.id, k.cliente, k.conta, k.saldo, k.dias,
         '⚠️ *Saldo acabando — ' || k.cliente || '*'
         || E'\n' || case k.plataforma when 'meta' then 'Meta Ads' else 'Google Ads' end || ' · ' || k.conta
         || E'\n\n' || case when k.tipo_pagamento = 'pre_pago'
                            then '💳 Crédito (boleto/Pix): '
                            else '💳 Até o teto de gastos: ' end || trafego.fmt_brl(k.saldo)
         || E'\n⏳ Dura ~' || trafego.fmt_num(k.dias, 1) || ' dia(s) no ritmo dos últimos 7 dias'
         || E'\n🔔 Aviso configurado: ' || k.alerta_saldo_dias || ' dias'
  from candidatos k
  join novos n on n.conta_anuncio_id = k.id
  order by k.dias, k.cliente;
end;
$$;

revoke execute on function trafego.alertas_saldo_pendentes() from public, anon, authenticated;
grant execute on function trafego.alertas_saldo_pendentes() to service_role;

commit;
