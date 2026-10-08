'use server';

// Botão "Atualizar" do dashboard: coleta agora só a clínica que está na tela.
//
// Quem pode atualizar o quê é decidido pela RLS: as contas são lidas com a
// sessão do usuário, então o gestor só consegue disparar a coleta das contas
// dele. Só DEPOIS disso a coleta roda com service_role.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sincronizar } from '@/lib/coleta/sincronizar';

// Protege a cota das APIs contra cliques repetidos.
const INTERVALO_MINIMO_MS = 5 * 60 * 1000;

export async function atualizarClinica(contaId: string): Promise<{ ok: boolean; mensagem: string }> {
  const supabase = await createClient();
  const db = supabase.schema('trafego');

  const { data: conta } = await db.from('contas_anuncio').select('id, cliente_id').eq('id', contaId).maybeSingle();
  if (!conta) return { ok: false, mensagem: 'Conta não encontrada ou sem acesso.' };

  // A clínica inteira (Meta e Google), só o que este usuário enxerga.
  const { data: contas } = conta.cliente_id
    ? await db.from('contas_anuncio').select('id').eq('cliente_id', conta.cliente_id).eq('ativa', true)
    : { data: [{ id: conta.id }] };
  const ids = (contas ?? []).map((c) => c.id as string);

  const { data: ultima } = await db
    .from('sync_log')
    .select('inicio')
    .in('conta_anuncio_id', ids)
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima && Date.now() - new Date(ultima.inicio).getTime() < INTERVALO_MINIMO_MS) {
    return { ok: false, mensagem: 'Atualizado há menos de 5 minutos. Tente daqui a pouco.' };
  }

  const resultado = await sincronizar(ids);
  revalidatePath('/');
  revalidatePath('/conta');

  const erros = [resultado.meta, resultado.google]
    .flatMap((r) => (typeof r === 'string' ? (r.startsWith('erro') ? [r] : []) : Object.values(r).filter((v) => v.startsWith('erro'))));
  return erros.length
    ? { ok: false, mensagem: `Atualizado com erro: ${erros[0]}` }
    : { ok: true, mensagem: 'Atualizado agora.' };
}
