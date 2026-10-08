import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Entra quem tem papel em public.user_roles (admin ou gestor, Fase 0 do
// Carteira). O que cada um VÊ quem decide é a RLS do schema trafego, não esta tela.
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: papel } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!papel) redirect('/sem-acesso');

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto max-w-[1200px] px-5 h-14 flex items-center gap-6">
          <Link href="/" className="font-semibold text-sm">Tráfego — Resili Sevenn</Link>
          {papel.role === 'admin' && (
            <Link href="/config" className="text-sm text-muted hover:text-foreground">Configuração</Link>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted">{user.email}</span>
            <form action={sair}>
              <button type="submit" className="text-sm text-faint hover:text-foreground">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1200px] px-5 py-8">{children}</main>
    </>
  );
}

async function sair() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
