-- O mínimo do Supabase "de fábrica" (sem nada do Carteira), para simular um
-- PROJETO NOVO: papéis, auth.users e auth.uid(). NÃO aplicar no Supabase.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role, anon;
grant execute on function auth.uid() to public;
