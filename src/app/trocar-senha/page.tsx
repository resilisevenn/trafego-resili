// Fora do grupo (app): sem cabeçalho e sem a checagem de papel, porque o 1º
// acesso cai aqui antes de qualquer outra tela. O proxy já exige login.

import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FormTrocarSenha } from '@/components/form-trocar-senha';

export default async function TrocarSenhaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const obrigatoria = Boolean(user.app_metadata?.trocar_senha);

  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image src="/logo-resili-sevenn.png" alt="Resili Sevenn" width={384} height={40} className="h-10 w-auto" priority />
        </div>
        <div className="card p-6">
          <h1 className="font-display text-2xl">{obrigatoria ? 'Crie sua senha' : 'Trocar senha'}</h1>
          <p className="text-sm text-muted mt-1 mb-6">
            {obrigatoria
              ? 'Você entrou com uma senha provisória. Escolha a sua para continuar.'
              : user.email}
          </p>
          <FormTrocarSenha pedirAtual={!obrigatoria} />
          {!obrigatoria && (
            <Link href="/" className="block text-center text-sm text-muted hover:text-foreground mt-4">Voltar</Link>
          )}
        </div>
      </div>
    </main>
  );
}
