// Prévia LOCAL da visão geral, com dados FICTÍCIOS (./dados.ts). Só em
// `npm run dev`: em produção responde 404. Fora do proxy de login.

import { notFound } from 'next/navigation';
import { PERIODOS_GERAL, VisaoGeral } from '@/components/visao-geral';
import { BotaoAcao } from '@/components/botao-acao';
import { FiltroPlataforma, lerFiltro } from '@/components/filtro-plataforma';
import { descreverPeriodo, diasDoPeriodo, entre, periodoAnterior, resolverPeriodo, totais } from '@/lib/painel/agregar';
import { hojeNoFuso } from '@/lib/coleta/datas';
import { prioridade, saude } from '@/lib/painel/saude';
import { CONTAS, linhasFicticias } from './dados';

// Prévia: finge a coleta (2 s) sem chamar nenhuma plataforma.
async function atualizarFicticio() {
  'use server';
  // A página some em produção, mas a ação ficaria acessível: barra aqui também.
  if (process.env.NODE_ENV !== 'development') throw new Error('Só na prévia local.');
  await new Promise((r) => setTimeout(r, 2000));
  return { ok: true, mensagem: 'Atualizado agora (prévia: nada foi coletado).' };
}

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PreviaGeral({ searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const q = await searchParams;
  const hoje = hojeNoFuso('America/Sao_Paulo');
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const ontem = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 62);
  const dias = diasDoPeriodo({ de: d.toISOString().slice(0, 10), ate: hoje });

  const chave = PERIODOS_GERAL.some(([k]) => k === q.periodo) ? q.periodo! : '7d';
  const plataforma = lerFiltro(q.plataforma);
  const periodo = resolverPeriodo(chave, hoje);
  const anterior = periodoAnterior(periodo);

  const linhas = CONTAS.map((c) => {
    const ls = linhasFicticias(c.id, c.plataforma, dias, ontem);
    return {
      contaId: c.id,
      cliente: c.cliente,
      conta: c.nome,
      plataforma: c.plataforma,
      saldo: c.saldo,
      infoSaldo: { fonte: c.fonte, saldo: c.saldo, teto: c.teto },
      numeros: { atual: totais(entre(ls, periodo)), anterior: anterior ? totais(entre(ls, anterior)) : null },
      saude: saude({
        hoje,
        plataforma: c.plataforma,
        linhas: ls,
        saldo: c.saldo,
        fonteSaldo: c.fonte,
        alertaDias: c.alertaDias,
        verbaMensal: c.verba,
        cplMeta: c.cplMeta,
        ultimaColeta: c.id === 'novo' ? null : { inicio: new Date().toISOString(), status: c.erro ? 'erro' : 'ok' },
      }),
    };
  }).sort((a, b) => prioridade(b.saude) - prioridade(a.saude));

  return (
    <VisaoGeral
      linhas={plataforma ? linhas.filter((l) => l.plataforma === plataforma) : linhas}
      hrefConta={(id) => `/previa/conta?conta=${id}`}
      periodo={chave}
      rotuloPeriodo={descreverPeriodo(periodo, anterior)}
      hrefPeriodo={(k) => {
        const p = new URLSearchParams();
        if (k !== '7d') p.set('periodo', k);
        if (plataforma) p.set('plataforma', plataforma);
        return p.size ? `/previa?${p}` : '/previa';
      }}
      filtro={<FiltroPlataforma caminho="/previa" parametro="plataforma" atual={plataforma} params={q} />}
      atualizar={<BotaoAcao rotulo="↻ Atualizar todas" rotuloPendente="Coletando todas as contas…" acao={atualizarFicticio} />}
    />
  );
}
