-- Imita o mínimo do Supabase + a 0007 do Carteira, para testar as migrations
-- num PostgreSQL local. NÃO aplicar no Supabase.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role, anon;
grant execute on function auth.uid() to public;
create table public.user_roles (user_id uuid primary key references auth.users, role text not null check (role in ('admin','gestor')));
alter table public.user_roles enable row level security;
create policy "le proprio papel" on public.user_roles for select to authenticated using (user_id = auth.uid());
grant select on public.user_roles to authenticated;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
