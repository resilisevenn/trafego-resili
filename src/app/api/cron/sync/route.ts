// /api/cron/sync — coleta diária, chamada pelo Vercel Cron (vercel.json).
//
// O Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". Sem o segredo
// certo a rota responde 401: ela grava com service_role e consome a cota da API.
//
// Cada conta roda isolada: o erro de uma vai para o sync_log dela e as outras
// seguem. Meta e Google rodam em paralelo; credencial ausente pula a plataforma.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hojeNoFuso, janela } from '@/lib/coleta/datas';
import * as meta from '@/lib/coleta/meta';
import * as google from '@/lib/coleta/google';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Db = ReturnType<typeof createAdminClient>;
type Plataforma = 'meta' | 'google';

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const db = createAdminClient();
  const [resMeta, resGoogle] = await Promise.all([coletarMeta(db), coletarGoogle(db)]);
  return NextResponse.json({ meta: resMeta, google: resGoogle });
}

// ── Meta ─────────────────────────────────────────────────────────────────────

async function coletarMeta(db: Db) {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) return 'pulado: META_SYSTEM_USER_TOKEN ausente';

  try {
    const contas = await meta.listarContas(token);
    const ids = await registrarContas(db, 'meta', contas.map((c) => ({
      conta_id: c.account_id, nome: c.name, moeda: c.currency, fuso: c.timezone_name,
    })));

    const resumo: Record<string, string> = {};
    for (const c of contas) {
      const uuid = ids.get(c.account_id);
      if (!uuid) continue;
      resumo[c.name] = await comLog(db, 'meta', uuid, async () => {
        const [campanhas, insights] = await Promise.all([
          meta.listarCampanhas(c.account_id, token),
          meta.buscarInsights(c.account_id, token, janela(c.timezone_name)),
        ]);
        return gravarConta(db, uuid, {
          campanhas: [
            ...campanhas.map((x) => ({ id: x.id, nome: x.name, status: x.effective_status, objetivo: x.objective })),
            // Campanha que só aparece nos insights (ex.: apagada depois de gastar).
            ...insights.map((l) => ({ id: l.campaign_id, nome: l.campaign_name, status: 'DESCONHECIDO', objetivo: l.objective })),
          ],
          metricas: insights.map(meta.paraMetrica),
          saldo: { data: hojeNoFuso(c.timezone_name), ...meta.paraSaldo(c) },
        });
      });
    }
    return resumo;
  } catch (e) {
    await logGeral(db, 'meta', (e as Error).message);
    return `erro: ${(e as Error).message}`;
  }
}

// ── Google ───────────────────────────────────────────────────────────────────

async function coletarGoogle(db: Db) {
  const cred = google.credDoAmbiente();
  if (!cred) return 'pulado: variáveis GOOGLE_ADS_* incompletas';

  try {
    const acesso = await google.tokenDeAcesso(cred);
    const contas = (await google.listarContas(cred, acesso)).map((l) => l.customerClient);
    const ids = await registrarContas(db, 'google', contas.map((c) => ({
      conta_id: String(c.id), nome: c.descriptiveName, moeda: c.currencyCode, fuso: c.timeZone,
    })));

    const resumo: Record<string, string> = {};
    for (const c of contas) {
      const uuid = ids.get(String(c.id));
      if (!uuid) continue;
      resumo[c.descriptiveName] = await comLog(db, 'google', uuid, async () => {
        const [linhas, orcamentos] = await Promise.all([
          google.buscarCampanhas(cred, acesso, String(c.id), janela(c.timeZone)),
          google.buscarOrcamentos(cred, acesso, String(c.id)),
        ]);
        return gravarConta(db, uuid, {
          campanhas: linhas.map((l) => ({
            id: l.campaign.id, nome: l.campaign.name, status: l.campaign.status, objetivo: l.campaign.advertisingChannelType,
          })),
          metricas: linhas.map(google.paraMetrica),
          saldo: { data: hojeNoFuso(c.timeZone), ...google.paraSaldo(orcamentos) },
        });
      });
    }
    return resumo;
  } catch (e) {
    await logGeral(db, 'google', (e as Error).message);
    return `erro: ${(e as Error).message}`;
  }
}

// ── Banco (comum às plataformas) ─────────────────────────────────────────────

// Conta nova que apareceu no BM/MCC entra sozinha, sem cliente e sem gestor:
// só o admin a vê até ligá-la a um cliente na tela de configuração.
// ignoreDuplicates: não sobrescreve nome/cliente/limite ajustados à mão.
// Devolve conta_id nativo → uuid, só das contas ATIVAS.
async function registrarContas(
  db: Db,
  plataforma: Plataforma,
  contas: { conta_id: string; nome: string; moeda: string; fuso: string }[],
) {
  if (contas.length) {
    await falhaSe(db.from('contas_anuncio').upsert(
      contas.map((c) => ({ plataforma, ...c })),
      { onConflict: 'plataforma,conta_id', ignoreDuplicates: true },
    ));
  }
  const { data, error } = await db
    .from('contas_anuncio')
    .select('id, conta_id')
    .eq('plataforma', plataforma)
    .eq('ativa', true);
  if (error) throw new Error(`leitura de contas_anuncio: ${error.message}`);
  return new Map(data.map((c) => [c.conta_id as string, c.id as string]));
}

type DadosConta = {
  campanhas: { id: string; nome: string; status: string; objetivo?: string }[];
  metricas: { campanha_id: string; data: string }[];
  saldo: { data: string; saldo: number | null; tipo_pagamento: string; fonte: string; bruto: unknown };
};

async function gravarConta(db: Db, uuid: string, d: DadosConta) {
  const agora = new Date().toISOString();

  // Campanhas antes das métricas: metricas_diarias tem FK para campanhas.
  // Dedup por id: a primeira ocorrência vence (a lista de campanhas da API vem antes).
  const campanhas = new Map<string, DadosConta['campanhas'][number]>();
  for (const c of d.campanhas) if (!campanhas.has(c.id)) campanhas.set(c.id, c);
  if (campanhas.size) {
    await falhaSe(db.from('campanhas').upsert(
      [...campanhas.values()].map((c) => ({
        conta_anuncio_id: uuid, campanha_id: c.id, nome: c.nome, status: c.status,
        objetivo: c.objetivo ?? null, atualizado_em: agora,
      })),
      { onConflict: 'conta_anuncio_id,campanha_id' },
    ));
  }

  if (d.metricas.length) {
    await falhaSe(db.from('metricas_diarias').upsert(
      d.metricas.map((m) => ({ conta_anuncio_id: uuid, ...m, atualizado_em: agora })),
      { onConflict: 'conta_anuncio_id,campanha_id,data' },
    ));
  }

  await falhaSe(db.from('saldo_conta').upsert(
    { conta_anuncio_id: uuid, ...d.saldo, coletado_em: agora },
    { onConflict: 'conta_anuncio_id,data' },
  ));

  return d.metricas.length;
}

async function comLog(db: Db, plataforma: Plataforma, uuid: string, fn: () => Promise<number>) {
  const { data: log } = await db
    .from('sync_log')
    .insert({ plataforma, conta_anuncio_id: uuid })
    .select('id')
    .single();

  const fechar = (campos: object) =>
    log && db.from('sync_log').update({ ...campos, fim: new Date().toISOString() }).eq('id', log.id);

  try {
    const linhas = await fn();
    await fechar({ status: 'ok', linhas });
    return `ok (${linhas} linhas)`;
  } catch (e) {
    await fechar({ status: 'erro', erro: (e as Error).message });
    return `erro: ${(e as Error).message}`;
  }
}

async function falhaSe(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

async function logGeral(db: Db, plataforma: Plataforma, erro: string) {
  await db.from('sync_log').insert({ plataforma, status: 'erro', erro, fim: new Date().toISOString() });
}
