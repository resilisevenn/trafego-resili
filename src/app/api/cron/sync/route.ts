// /api/cron/sync — coleta diária de TODAS as contas, chamada pelo Vercel Cron
// (vercel.json: 09h UTC = 06h de Brasília; o plano gratuito permite 1x por dia).
// Ao longo do dia, o botão "Atualizar" do dashboard coleta só a clínica na tela.
//
// O Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". Sem o segredo
// certo a rota responde 401: ela grava com service_role e consome a cota da API.

import { NextResponse } from 'next/server';
import { sincronizar } from '@/lib/coleta/sincronizar';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }
  return NextResponse.json(await sincronizar());
}
