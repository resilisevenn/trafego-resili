import { Cabecalho } from '@/components/cabecalho';
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
      <Cabecalho
        email={user.email ?? ''}
        admin={papel.role === 'admin'}
        sair={
          <form action={sair}>
            <button type="submit" className="text-sm text-faint hover:text-foreground">Sair</button>
          </form>
        }
      />
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
