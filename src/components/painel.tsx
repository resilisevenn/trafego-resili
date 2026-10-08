// Desenho do dashboard de UMA conta. Só recebe dados prontos: quem busca é a
// página real (banco, com RLS) ou a prévia local (dados fictícios). Assim a
// prévia mostra exatamente o mesmo visual que vai para produção.

import Link from 'next/link';
import { Suspense } from 'react';
import { Seletor, type OpcaoConta } from '@/components/seletor';
import { GraficoBarras } from '@/components/grafico-barras';
import {
  porCampanha, seriePorDia, totais, variacao, type LinhaMetrica, type Periodo, type Totais,
} from '@/lib/painel/agregar';
import {
  fmtContagem, fmtData, fmtDecimal, fmtInteiro, fmtMoeda, fmtPct, SEM_DADO,
} from '@/lib/painel/formato';

export type DadosPainel = {
  opcoes: OpcaoConta[];
  contaId: string;
  plataforma: string;
  periodo: Periodo & { chave: string };
  anterior: Periodo | null; // nulo em "Máximo"
  linhas: LinhaMetrica[]; // período atual + anterior
  nomes: Map<string, { nome: string; status: string | null }>;
  saldo: { saldo: number | null; data?: string; fonte?: string } | null;
  limite: number | null;
  sync: { inicio: string; status: string; erro: string | null; linhas: number | null } | null;
  atualizar?: React.ReactNode; // botão "Atualizar", ao lado dos filtros
  voltar?: string; // link de volta para a visão geral
};

export function Painel(d: DadosPainel) {
  // Cada período filtrado pelas PRÓPRIAS datas: o anterior nem sempre encosta no
  // atual (este mês até dia 8 × 01 a 08 do mês passado deixa um vão no meio).
  const entre = (p: Periodo) => d.linhas.filter((l) => l.data >= p.de && l.data <= p.ate);
  const doPeriodo = entre(d.periodo);
  const atual = totais(doPeriodo);
  const antes = d.anterior ? totais(entre(d.anterior)) : null;

  return (
    <div className="flex flex-col gap-6">
      {d.voltar && (
        <Link href={d.voltar} className="text-sm text-muted hover:text-foreground self-start">← Visão geral</Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Suspense>
          <Seletor contas={d.opcoes} contaId={d.contaId} periodo={d.periodo.chave} de={d.periodo.de} ate={d.periodo.ate} />
        </Suspense>
        {d.atualizar}
      </div>

      <p className="text-sm text-muted">
        {fmtData(d.periodo.de)} a {fmtData(d.periodo.ate)}
        {d.anterior ? ` · comparado com ${fmtData(d.anterior.de)} a ${fmtData(d.anterior.ate)}` : ' · sem comparação'}
      </p>

      <CardSaldo saldo={d.saldo?.saldo ?? null} limite={d.limite} data={d.saldo?.data} fonte={d.saldo?.fonte} />

      <Cards atual={atual} antes={antes} plataforma={d.plataforma} />

      <div className="grid gap-4 md:grid-cols-2">
        <GraficoBarras titulo="Investimento por dia" serie={seriePorDia(doPeriodo, d.periodo, 'investimento')} formato="moeda" />
        <GraficoBarras titulo={d.plataforma === 'google' ? 'Conversões por dia' : 'Leads por dia'} serie={seriePorDia(doPeriodo, d.periodo, 'leads')} formato="contagem" />
      </div>

      <TabelaCampanhas linhas={porCampanha(doPeriodo)} nomes={d.nomes} plataforma={d.plataforma} />

      <StatusColeta sync={d.sync} />
    </div>
  );
}

// ── Cards de métricas ────────────────────────────────────────────────────────

// "menor é melhor" inverte a cor da variação (CPC subir é ruim).
type Card = { chave: keyof Totais; rotulo: string; fmt: (v: number | null) => string; menorMelhor?: boolean; nota?: string };

// 10 cards por plataforma (5 + 5). Cada uma mostra o que ela de fato mede:
// o Google não tem alcance, frequência nem conversas de mensagem; a Meta não
// tem parcela de impressões. Na Meta, alcance vem antes de impressões (prioridade
// do Jackson); impressões continua na tabela de campanhas.
const CARDS: Record<string, Card[]> = {
  meta: [
    { chave: 'investimento', rotulo: 'Investimento', fmt: fmtMoeda },
    { chave: 'alcance', rotulo: 'Alcance', fmt: fmtInteiro, nota: 'Soma dos dias: quem viu em dois dias conta duas vezes.' },
    { chave: 'frequencia', rotulo: 'Frequência', fmt: fmtDecimal, nota: 'Calculada sobre o alcance somado: tende a ficar abaixo da real.' },
    { chave: 'cliques', rotulo: 'Cliques', fmt: fmtInteiro },
    { chave: 'ctr', rotulo: 'CTR', fmt: fmtPct },
    { chave: 'cpc', rotulo: 'CPC', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'cpm', rotulo: 'CPM', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'leads', rotulo: 'Leads', fmt: fmtContagem },
    { chave: 'cpl', rotulo: 'Custo por lead', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'conversas', rotulo: 'Conversas', fmt: fmtContagem },
  ],
  google: [
    { chave: 'investimento', rotulo: 'Investimento', fmt: fmtMoeda },
    { chave: 'impressoes', rotulo: 'Impressões', fmt: fmtInteiro },
    { chave: 'cliques', rotulo: 'Cliques', fmt: fmtInteiro },
    { chave: 'ctr', rotulo: 'CTR', fmt: fmtPct },
    { chave: 'cpc', rotulo: 'CPC', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'cpm', rotulo: 'CPM', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'leads', rotulo: 'Conversões', fmt: fmtContagem },
    { chave: 'cpl', rotulo: 'Custo por conversão', fmt: fmtMoeda, menorMelhor: true },
    { chave: 'taxa_conversao', rotulo: 'Taxa de conversão', fmt: fmtPct },
    { chave: 'parcela_impressoes', rotulo: 'Parcela de impressões', fmt: fmtPct, nota: 'Só campanhas de pesquisa. Ponderada pelas impressões de cada dia.' },
  ],
};

function Cards({ atual, antes, plataforma }: { atual: Totais; antes: Totais | null; plataforma: string }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {(CARDS[plataforma] ?? CARDS.meta).map((m) => {
        const v = antes ? variacao(atual[m.chave], antes[m.chave]) : null;
        const bom = v == null || v === 0 ? null : m.menorMelhor ? v < 0 : v > 0;
        // Investimento subir não é "bom" nem "ruim": fica neutro.
        const neutro = m.chave === 'investimento';
        return (
          <div key={m.chave} className="card p-4" title={m.nota}>
            <div className="text-xs text-muted">{m.rotulo}{m.nota ? ' *' : ''}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{m.fmt(atual[m.chave])}</div>
            <div className="text-xs mt-1 tabular-nums">
              {v == null ? (
                <span className="text-faint">{SEM_DADO}</span>
              ) : (
                <span className={neutro || bom == null ? 'text-muted' : bom ? 'text-ok' : 'text-bad'}>
                  {v > 0 ? '▲' : v < 0 ? '▼' : '='} {fmtDecimal(Math.abs(v))}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Saldo ────────────────────────────────────────────────────────────────────

const FONTES: Record<string, string> = {
  spend_cap_menos_gasto: 'limite de gastos − gasto',
  account_budget: 'orçamento da conta − gasto',
  sem_limite: 'conta sem limite: sem saldo pela API',
  sem_account_budget: 'sem orçamento de conta',
};

function CardSaldo({ saldo, limite, data, fonte }: { saldo: number | null; limite: number | null; data?: string; fonte?: string }) {
  const baixo = saldo != null && limite != null && saldo < limite;
  return (
    <div className={`card p-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${baixo ? 'border-bad' : ''}`}>
      <div>
        <div className="text-xs text-muted">Saldo da conta</div>
        <div className="text-2xl font-semibold tabular-nums">{fmtMoeda(saldo)}</div>
      </div>
      {baixo && (
        // Estado nunca só por cor: ícone + texto.
        <div className="text-sm text-bad font-medium" role="status">⚠ Abaixo do limite de alerta ({fmtMoeda(limite)})</div>
      )}
      <div className="text-xs text-faint ml-auto">
        {data ? `Foto de ${fmtData(data)}` : 'Ainda sem coleta'}
        {fonte ? ` · ${FONTES[fonte] ?? fonte}` : ''}
        {limite == null ? ' · sem limite de alerta definido' : ''}
      </div>
    </div>
  );
}

// ── Tabela de campanhas ──────────────────────────────────────────────────────

function TabelaCampanhas({ linhas, nomes, plataforma }: {
  plataforma: string;
  linhas: ReturnType<typeof porCampanha>;
  nomes: Map<string, { nome: string; status: string | null }>;
}) {
  const google = plataforma === 'google';
  if (!linhas.length) return <Aviso titulo="Sem dados no período">Nenhuma campanha veiculou nestes dias.</Aviso>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted text-right">
          <tr className="border-b border-border">
            <th className="text-left p-3 font-medium">Campanha</th>
            <th className="p-3 font-medium">Investimento</th>
            <th className="p-3 font-medium">Impressões</th>
            <th className="p-3 font-medium">Cliques</th>
            <th className="p-3 font-medium">CTR</th>
            <th className="p-3 font-medium">CPC</th>
            <th className="p-3 font-medium">CPM</th>
            <th className="p-3 font-medium">{google ? 'Conversões' : 'Leads'}</th>
            <th className="p-3 font-medium">{google ? 'Custo/conv.' : 'CPL'}</th>
            <th className="p-3 font-medium">{google ? 'Parcela impr.' : 'Conversas'}</th>
          </tr>
        </thead>
        <tbody className="text-right">
          {linhas.map((c) => {
            const info = nomes.get(c.campanha_id);
            return (
              <tr key={c.campanha_id} className="border-b border-border last:border-0">
                <td className="text-left p-3">
                  <div>{info?.nome ?? c.campanha_id}</div>
                  {info?.status && <div className="text-xs text-faint">{info.status}</div>}
                </td>
                <td className="p-3">{fmtMoeda(c.investimento)}</td>
                <td className="p-3">{fmtInteiro(c.impressoes)}</td>
                <td className="p-3">{fmtInteiro(c.cliques)}</td>
                <td className="p-3">{fmtPct(c.ctr)}</td>
                <td className="p-3">{fmtMoeda(c.cpc)}</td>
                <td className="p-3">{fmtMoeda(c.cpm)}</td>
                <td className="p-3">{fmtContagem(c.leads)}</td>
                <td className="p-3">{fmtMoeda(c.cpl)}</td>
                <td className="p-3">{google ? fmtPct(c.parcela_impressoes) : fmtContagem(c.conversas)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Status e avisos ──────────────────────────────────────────────────────────

function StatusColeta({ sync }: { sync: { inicio: string; status: string; erro: string | null; linhas: number | null } | null }) {
  if (!sync) return <p className="text-xs text-faint">Coleta: ainda não rodou para esta conta.</p>;
  const quando = new Date(sync.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return (
    <p className={`text-xs ${sync.status === 'erro' ? 'text-bad' : 'text-faint'}`}>
      Última coleta: {quando} ·{' '}
      {sync.status === 'ok' ? `ok (${sync.linhas} linhas)` : sync.status === 'erro' ? `⚠ erro: ${sync.erro}` : 'rodando…'}
    </p>
  );
}

export function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-sm text-muted mt-1">{children}</p>
    </div>
  );
}
