'use server';

// Ações da página de admin (BRIEFING-ADMIN.md). Usuários vivem no Supabase Auth,
// compartilhado com o Carteira: só a service_role cria usuário ou troca senha.
// Por isso cada ação confere is_admin() com a sessão de QUEM CLICOU antes de
// usar a service_role, e nenhuma ação mexe em admin (seção 2 do brief).

import { revalidatePath } from 'next/cache';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gerarSenhaProvisoria } from '@/lib/admin/senha';

type Resultado = { ok: boolean; mensagem: string };

export type Usuario = {
  id: string;
  nome: string | null;
  email: string;
  papel: 'admin' | 'gestor' | null; // null = desativado
  ultimoAcesso: string | null;
  trocarSenha: boolean;
};

async function exigirAdmin() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_admin');
  if (!admin) throw new Error('Só o admin gerencia usuários.');
  return createAdminClient();
}

const papeis = (db: ReturnType<typeof createAdminClient>) => db.schema('public').from('user_roles');

async function papelDe(db: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await papeis(db).select('role').eq('user_id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role ?? null) as Usuario['papel'];
}

// Só gestor ativo ou desativado por esta tela. Admin e usuário que nunca passou
// pelo tráfego (ex.: alguém só do Carteira) não são alvo de nenhuma ação.
async function exigirGestor(db: ReturnType<typeof createAdminClient>, id: string): Promise<User> {
  const { data, error } = await db.auth.admin.getUserById(id);
  if (error || !data.user) throw new Error('Usuário não encontrado.');
  const papel = await papelDe(db, id);
  if (papel === 'admin') throw new Error('Esta tela não altera admin.');
  if (papel !== 'gestor' && !data.user.app_metadata?.trafego_desativado) {
    throw new Error('Este usuário não é gestor do tráfego.');
  }
  return data.user;
}

const atualizar = () => revalidatePath('/admin');

// Quem aparece: todo usuário com papel e os gestores desativados por esta tela.
export async function listarUsuarios(): Promise<Usuario[]> {
  const db = await exigirAdmin();
  const { data: r, error: e1 } = await papeis(db).select('user_id, role');
  if (e1) throw new Error(e1.message);
  const papel = new Map(r.map((x) => [x.user_id as string, x.role as 'admin' | 'gestor']));

  // A base é pequena (dezenas): uma página de 1000 cobre com folga.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);

  return data.users
    .filter((u) => papel.has(u.id) || u.app_metadata?.trafego_desativado)
    .map((u) => ({
      id: u.id,
      nome: (u.user_metadata?.nome as string | undefined) ?? null,
      email: u.email ?? '',
      papel: papel.get(u.id) ?? null,
      ultimoAcesso: u.last_sign_in_at ?? null,
      trocarSenha: Boolean(u.app_metadata?.trocar_senha),
    }))
    .sort((a, b) => (a.papel === 'admin' ? 0 : 1) - (b.papel === 'admin' ? 0 : 1) || a.email.localeCompare(b.email));
}

export async function criarGestor(_: Resultado | null, form: FormData): Promise<Resultado> {
  const nome = String(form.get('nome') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!nome || !email) return { ok: false, mensagem: 'Preencha nome e e-mail.' };

  try {
    const db = await exigirAdmin();
    const senha = gerarSenhaProvisoria();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // sem e-mail de confirmação: não há SMTP (brief, seção 3)
      user_metadata: { nome },
      app_metadata: { trocar_senha: true },
    });
    if (error) {
      // O e-mail pode já existir por causa do Carteira: não reaproveita em silêncio.
      return {
        ok: false,
        mensagem: /already|registered|exists/i.test(error.message)
          ? 'Já existe um usuário com este e-mail (pode ser do Carteira). Nada foi alterado.'
          : error.message,
      };
    }
    const { error: e2 } = await papeis(db).insert({ user_id: data.user.id, role: 'gestor' });
    if (e2) {
      // Sem papel o usuário não entra em lugar nenhum; desfaz para não sobrar órfão.
      await db.auth.admin.deleteUser(data.user.id);
      return { ok: false, mensagem: `Não deu para dar o papel de gestor: ${e2.message}` };
    }
    atualizar();
    return { ok: true, mensagem: senha };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}

export async function novaSenhaProvisoria(id: string): Promise<Resultado> {
  try {
    const db = await exigirAdmin();
    const user = await exigirGestor(db, id);
    const senha = gerarSenhaProvisoria();
    const { error } = await db.auth.admin.updateUserById(id, {
      password: senha,
      app_metadata: { ...user.app_metadata, trocar_senha: true },
    });
    if (error) return { ok: false, mensagem: error.message };
    atualizar();
    return { ok: true, mensagem: senha };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}

// Tira o papel. O login continua existindo (é compartilhado com o Carteira) e as
// contas liberadas ficam guardadas para a reativação.
export async function desativarGestor(id: string): Promise<Resultado> {
  try {
    const db = await exigirAdmin();
    const user = await exigirGestor(db, id);
    const { error: e1 } = await db.auth.admin.updateUserById(id, {
      app_metadata: { ...user.app_metadata, trafego_desativado: true },
    });
    if (e1) return { ok: false, mensagem: e1.message };
    const { error: e2 } = await papeis(db).delete().eq('user_id', id).eq('role', 'gestor');
    if (e2) return { ok: false, mensagem: e2.message };
    atualizar();
    return { ok: true, mensagem: 'Desativado.' };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}

export async function reativarGestor(id: string): Promise<Resultado> {
  try {
    const db = await exigirAdmin();
    const user = await exigirGestor(db, id);
    const { error: e1 } = await papeis(db).upsert({ user_id: id, role: 'gestor' }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (e1) return { ok: false, mensagem: e1.message };
    const { error: e2 } = await db.auth.admin.updateUserById(id, {
      app_metadata: { ...user.app_metadata, trafego_desativado: false },
    });
    if (e2) return { ok: false, mensagem: e2.message };
    atualizar();
    return { ok: true, mensagem: 'Reativado.' };
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
}
