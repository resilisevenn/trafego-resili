import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default function SemAcessoPage() {
  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Sem acesso</h1>
        <p className="text-sm text-muted mt-1 mb-6">
          Sua conta não tem permissão para acessar o dashboard de tráfego. Peça ao administrador para liberar seu papel.
        </p>
        <form action={sair}>
          <button type="submit" className="btn btn-primary w-full">Sair</button>
        </form>
      </div>
    </main>
  );
}

async function sair() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
