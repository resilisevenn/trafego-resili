-- Dados FICTÍCIOS. Testa listar_gestores, relatorio_semanal e alertas_saldo_pendentes.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','admin@teste'),('00000000-0000-0000-0000-00000000000b','gestor@teste');
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'),('00000000-0000-0000-0000-00000000000b','gestor');

insert into trafego.clientes (id, nome) values ('10000000-0000-0000-0000-000000000001','Clínica Exemplo');
insert into trafego.contas_anuncio (id, plataforma, conta_id, nome, cliente_id, limite_alerta_saldo) values
 ('20000000-0000-0000-0000-000000000001','meta','111','Conta Meta Exemplo','10000000-0000-0000-0000-000000000001', 500),
 ('20000000-0000-0000-0000-000000000002','google','1234567890','Conta Google Exemplo','10000000-0000-0000-0000-000000000001', null);
insert into trafego.campanhas (conta_anuncio_id, campanha_id, nome) values
 ('20000000-0000-0000-0000-000000000001','m1','Meta 1'),
 ('20000000-0000-0000-0000-000000000002','g1','Google 1');
-- Semana atual (05 a 11/10): 100/dia na Meta; semana anterior: 80/dia.
insert into trafego.metricas_diarias (conta_anuncio_id, campanha_id, data, investimento, impressoes, alcance, cliques, leads, conversas)
select '20000000-0000-0000-0000-000000000001', 'm1', d::date,
       case when d >= '2026-10-05' then 1234.5 else 1000 end, 10000, 6000, 150, 4, 2
from generate_series('2026-09-28'::date, '2026-10-11'::date, '1 day') d;
insert into trafego.metricas_diarias (conta_anuncio_id, campanha_id, data, investimento, impressoes, alcance, cliques, leads)
select '20000000-0000-0000-0000-000000000002', 'g1', d::date, 50, 200, null, 20, 1.5
from generate_series('2026-10-05'::date, '2026-10-11'::date, '1 day') d;
insert into trafego.saldo_conta (conta_anuncio_id, data, saldo, fonte) values
 ('20000000-0000-0000-0000-000000000001', (now() at time zone 'America/Sao_Paulo')::date, 321.09, 'spend_cap_menos_gasto'),
 ('20000000-0000-0000-0000-000000000002', (now() at time zone 'America/Sao_Paulo')::date, null, 'sem_limite');

\echo '=== fmt'
select trafego.fmt_brl(1234567.891) brl, trafego.fmt_num(1234) n, trafego.fmt_num(1.25, 2) dec, trafego.fmt_brl(null) nulo, trafego.fmt_var(120, 100) var;

\echo '=== relatorio_semanal(2026-10-12)'
set role service_role;
select cliente, mensagem from trafego.relatorio_semanal('2026-10-12');

\echo '=== relatorio com config: só leads e investimento na Meta; Google fora'
reset role;
insert into trafego.relatorio_config (conta_anuncio_id, metricas) values ('20000000-0000-0000-0000-000000000001', array['investimento','leads']);
insert into trafego.relatorio_config (conta_anuncio_id, incluir) values ('20000000-0000-0000-0000-000000000002', false);
set role service_role;
select mensagem from trafego.relatorio_semanal('2026-10-12');

\echo '=== alerta: 1a chamada devolve 1, 2a devolve 0'
select conta, saldo, limite, mensagem from trafego.alertas_saldo_pendentes();
select count(*) as segunda_chamada from trafego.alertas_saldo_pendentes();
reset role;

\echo '=== listar_gestores: admin vê; gestor e anon não'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select * from trafego.listar_gestores();
\set ON_ERROR_STOP 0
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select * from trafego.listar_gestores();
\echo '=== usuário logado não chama relatório nem alerta'
select count(*) from trafego.relatorio_semanal();
select count(*) from trafego.alertas_saldo_pendentes();
