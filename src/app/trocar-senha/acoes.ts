'use server';

// Troca da própria senha: obrigatória no 1º acesso (senha provisória) e
// voluntária em "Minha senha". BRIEFING-ADMIN.md, seção 3.
//
// A senha é gravada com a service_role, e não com updateUser da sessão, porque
// a mesma chamada precisa limpar app_metadata.trocar_senha, que o usuário não
// consegue escrever. O alvo é SEMPRE o usuário da sessão: nada vem do formulário.

import { redirect } from 'next/navigation';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarSenhaNova } from '@/lib/admin/senha';

export async function trocarSenha(_: string | null, form: FormData): Promise<string | null> {
  const senha = String(form.get('senha') ?? '');
  const invalida = validarSenhaNova(senha, String(form.get('confirmacao') ?? ''));
  if (invalida) return invalida;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Troca voluntária exige a senha atual: painel aberto num computador alheio
  // não basta para tomar a conta. No 1º acesso não pede: a pessoa acabou de
  // entrar com a provisória. Quem decide o caso é o servidor, não o formulário.
  if (!user.app_metadata?.trocar_senha) {
    const atual = String(form.get('atual') ?? '');
    if (!atual) return 'Digite a senha atual.';
    if (!(await senhaConfere(user.email ?? '', atual))) return 'A senha atual está incorreta.';
    if (atual === senha) return 'A senha nova precisa ser diferente da atual.';
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password: senha,
    app_metadata: { ...user.app_metadata, trocar_senha: false },
  });
  if (error) return error.message;

  redirect('/');
}

// Confere a senha com um login avulso, num cliente sem sessão guardada: não
// mexe nos cookies de quem está logado.
async function senhaConfere(email: string, senha: string) {
  const avulso = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await avulso.auth.signInWithPassword({ email, password: senha });
  if (error) return false;
  // Encerra só a sessão avulsa que acabou de nascer.
  await avulso.auth.signOut({ scope: 'local' });
  return Boolean(data.user);
}
