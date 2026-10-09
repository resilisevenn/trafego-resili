'use server';

// Ações da tela de configuração. Rodam com a sessão do usuário: quem barra o
// não-admin é a RLS ("admin total" nas tabelas de configuração, 0001), não
// esta camada. Mesmo assim confere is_admin() para falhar com mensagem clara.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { lerReais } from '@/lib/painel/formato';
import { sincronizar } from '@/lib/coleta/sincronizar';

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

// Só cliente DESATIVADO pode ser excluído: desativar primeiro evita apagar por
// engano um cliente em uso. As contas ligadas voltam para "Sem cliente".
export async function excluirCliente(form: FormData) {
  const db = await dbAdmin();
  const id = String(form.get('id'));
  const { data: c } = await db.from('clientes').select('ativo').eq('id', id).maybeSingle();
  if (!c) throw new Error('Cliente não encontrado.');
  if (c.ativo) throw new Error('Desative o cliente antes de excluir.');
  ok((await db.from('clientes').delete().eq('id', id)).error);
}

// Aviso de saldo em dias (1 a 30). Vazio volta ao padrão (3).
function dias(form: FormData): number {
  const v = String(form.get('alerta_dias') ?? '').trim();
  if (v === '') return 3;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error('Aviso de saldo: use um número de dias entre 1 e 30');
  return n;
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
    alerta_saldo_dias: dias(form),
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
  const totalMetricas = Number(form.get('total_metricas'));
  const db = await dbAdmin();
  ok((await db.from('relatorio_config').upsert({
    conta_anuncio_id: contaId,
    incluir: form.get('incluir') === 'on',
    // Tudo marcado = nulo = "todas", inclusive as que surgirem depois.
    metricas: metricas.length === totalMetricas ? null : metricas,
    campanhas: campanhas.length === totalCampanhas ? null : campanhas,
    atualizado_em: new Date().toISOString(),
  })).error);
}

// "Buscar contas novas": a mesma coleta do cron das 06h, na hora. Pergunta à Meta
// (BM Resili) e ao Google (MCC) quais contas existem, cadastra as novas como
// "Sem cliente" e coleta os números de todas. Só admin.
export async function buscarContasAgora(): Promise<{ ok: boolean; mensagem: string }> {
  await dbAdmin();
  const r = await sincronizar();
  revalidatePath('/config');
  revalidatePath('/');
  revalidatePath('/conta');
  const contas = [r.meta, r.google].flatMap((p) => (typeof p === 'string' ? [p] : Object.values(p)));
  const erros = contas.filter((c) => c.startsWith('erro') || c.startsWith('pulado'));
  const ok = contas.length - erros.length;
  return erros.length
    ? { ok: false, mensagem: `${ok} conta(s) coletada(s); ${erros.length} com problema: ${erros[0]}` }
    : { ok: true, mensagem: `${ok} conta(s) coletada(s). Contas novas aparecem abaixo como "Sem cliente".` };
}
