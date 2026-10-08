'use server';

// Ações da tela de configuração. Rodam com a sessão do usuário: quem barra o
// não-admin é a RLS ("admin total" nas tabelas de configuração, 0001), não
// esta camada. Mesmo assim confere is_admin() para falhar com mensagem clara.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { METRICAS_RELATORIO } from '@/lib/painel/metricas';
import { lerReais } from '@/lib/painel/formato';

async function dbAdmin() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_admin');
  if (!admin) throw new Error('Só o admin altera a configuração.');
  return supabase.schema('trafego');
}

function ok(error: { message: string } | null) {
  if (error) throw new Error(error.message);
  revalidatePath('/config');
  revalidatePath('/');
  revalidatePath('/conta');
}

export async function criarCliente(form: FormData) {
  const nome = String(form.get('nome') ?? '').trim();
  if (!nome) return;
  const db = await dbAdmin();
  ok((await db.from('clientes').insert({ nome })).error);
}

export async function alternarCliente(form: FormData) {
  const db = await dbAdmin();
  ok((await db.from('clientes')
    .update({ ativo: form.get('ativo') === 'true' })
    .eq('id', String(form.get('id')))).error);
}

function reais(form: FormData, campo: string): number | null {
  const n = lerReais(String(form.get(campo) ?? ''));
  if (Number.isNaN(n)) throw new Error(`Valor inválido em ${campo}: use 1.234,56 ou 1234.56`);
  return n;
}

export async function salvarConta(form: FormData) {
  const db = await dbAdmin();
  ok((await db.from('contas_anuncio').update({
    cliente_id: String(form.get('cliente_id') || '') || null,
    // Vazio = sem alerta / sem meta para esta conta.
    limite_alerta_saldo: reais(form, 'limite'),
    verba_mensal: reais(form, 'verba'),
    cpl_meta: reais(form, 'cpl_meta'),
    ativa: form.get('ativa') === 'on',
  }).eq('id', String(form.get('id')))).error);
}

// Substitui o conjunto inteiro de contas do gestor pelo que veio marcado.
export async function salvarAcesso(form: FormData) {
  const userId = String(form.get('user_id'));
  const contas = form.getAll('contas').map(String);
  const db = await dbAdmin();

  const { error: e1 } = await db.from('acesso_conta').delete().eq('user_id', userId);
  if (e1) throw new Error(e1.message);
  if (contas.length) {
    ok((await db.from('acesso_conta').insert(contas.map((c) => ({ user_id: userId, conta_anuncio_id: c })))).error);
  } else {
    ok(null);
  }
}

export async function salvarRelatorio(form: FormData) {
  const contaId = String(form.get('conta_id'));
  const metricas = form.getAll('metricas').map(String);
  const campanhas = form.getAll('campanhas').map(String);
  const totalCampanhas = Number(form.get('total_campanhas'));
  const db = await dbAdmin();
  ok((await db.from('relatorio_config').upsert({
    conta_anuncio_id: contaId,
    incluir: form.get('incluir') === 'on',
    // Tudo marcado = nulo = "todas", inclusive as que surgirem depois.
    metricas: metricas.length === METRICAS_RELATORIO.length ? null : metricas,
    campanhas: campanhas.length === totalCampanhas ? null : campanhas,
    atualizado_em: new Date().toISOString(),
  })).error);
}
