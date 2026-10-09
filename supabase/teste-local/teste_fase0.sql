-- Fase 0: o gestor não lê NADA do Carteira e não se promove a admin. Dados fictícios.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','admin@teste'),('00000000-0000-0000-0000-00000000000b','gestor@teste');
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'),('00000000-0000-0000-0000-00000000000b','gestor');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\echo '=== admin cria um cliente no Carteira'
insert into public.clientes (nome, inicio) values ('Cliente Fictício', '2026-01-01');
select count(*) as admin_ve_clientes from public.clientes;
\echo '=== gestor: tudo zero'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select (select count(*) from public.clientes) clientes, (select count(*) from public.clientes_view) view,
       (select count(*) from public.avaliacoes) avaliacoes, (select count(*) from public.notas_historico) notas,
       (select count(*) from public.auditoria) auditoria, (select count(*) from public.profiles) perfis_visiveis;
\echo '=== gestor tenta virar admin (deve falhar)'
\set ON_ERROR_STOP 0
update public.user_roles set role = 'admin' where user_id = auth.uid();
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000c','admin');
select role as papel_continua from public.user_roles;
