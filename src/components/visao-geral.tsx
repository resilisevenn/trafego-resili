// Visão geral: todas as contas que o usuário vê, numa tabela só, ordenada por
// quem precisa de ação. É a "tela da manhã" do gestor. Só recebe dados prontos:
// quem busca é a página real (banco, com RLS) ou a prévia local.

import Link from 'next/link';
import { variacao, type Totais } from '@/lib/painel/agregar';
import type { Saude } from '@/lib/painel/saude';
import { fmtContagem, fmtDecimal, fmtMoeda } from '@/lib/painel/formato';
import { LogoPlataforma } from '@/components/logo-plataforma';
import { situacaoSaldo, type InfoSaldo } from '@/lib/painel/saldo';

export type LinhaGeral = {
  contaId: string;
  cliente: string;
  conta: string;
  plataforma: string;
  saldo: number | null;
  infoSaldo: InfoSaldo;
  // Colunas de números: período escolhido no seletor (padrão: 7 dias fechados).
  // Os ALERTAS não seguem o seletor: usam sempre os 7 dias fechados (saude).
  numeros: { atual: Totais; anterior: Totais | null };
  saude: Saude;
};

const PLATAFORMA: Record<string, string> = { meta: 'Meta', google: 'Google' };

// Períodos da visão geral: curtos, para acompanhar o dia e a semana.
export const PERIODOS_GERAL = [
  ['hoje', 'Hoje'],
  ['ontem', 'Ontem'],
  ['7d', '7 dias'],
  ['mes', 'Este mês'],
] as const;

export function VisaoGeral({ linhas, hrefConta, periodo, rotuloPeriodo, hrefPeriodo, atualizar, filtro }: {
  linhas: LinhaGeral[];
  hrefConta: (id: string) => string;
  periodo: string; // chave ativa
  rotuloPeriodo: string; // "01/10 a 07/10 · comparado com 24/09 a 30/09"
  hrefPeriodo: (chave: string) => string;
  atualizar?: React.ReactNode; // botão "Atualizar todas"
  filtro?: React.ReactNode; // botões Meta Ads / Google Ads
}) {
  const criticos = linhas.filter((l) => l.saude.alertas.some((a) => a.nivel === 'critico')).length;
  const atencao = linhas.filter((l) => l.saude.alertas.length && !l.saude.alertas.some((a) => a.nivel === 'critico')).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Visão geral</h1>
          <p className="text-sm text-muted mt-1">{rotuloPeriodo}</p>
          <p className="text-xs text-faint">Os alertas usam sempre os últimos 7 dias fechados.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="group" aria-label="Período dos números">
            {PERIODOS_GERAL.map(([chave, rotulo]) => (
              <Link
                key={chave}
                href={hrefPeriodo(chave)}
                aria-pressed={periodo === chave}
                className={`btn ${periodo === chave ? 'btn-primary' : ''}`}
                scroll={false}
              >
                {rotulo}
              </Link>
            ))}
          </div>
          {atualizar}
        </div>
      </div>

      {/* Cards à esquerda, filtro de plataforma à direita, na mesma linha. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 grid-cols-3 w-full max-w-xl">
          <Resumo rotulo="Contas" valor={linhas.length} />
          <Resumo rotulo="🔴 Ação agora" valor={criticos} destaque={criticos > 0 ? 'bad' : undefined} />
          <Resumo rotulo="🟡 Atenção" valor={atencao} destaque={atencao > 0 ? 'warn' : undefined} />
        </div>
        {filtro}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted text-right">
            <tr className="border-b border-border">
              <th className="text-left p-3 font-medium">Clínica / conta</th>
              <th className="p-3 font-medium">Investimento</th>
              <th className="p-3 font-medium">Leads / conv.</th>
              <th className="p-3 font-medium">CPL</th>
              <th className="p-3 font-medium">Saldo</th>
              <th className="p-3 font-medium">Verba do mês</th>
              <th className="text-left p-3 font-medium">Alertas</th>
            </tr>
          </thead>
          <tbody className="text-right">
            {linhas.map((l) => {
              const s = l.saude;
              const n = l.numeros;
              return (
                <tr key={l.contaId} className="border-b border-border last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="text-left p-3">
                    <Link href={hrefConta(l.contaId)} className="hover:underline">
                      <div className="font-medium">{l.cliente}</div>
                      <div className="flex items-center gap-1.5 text-xs text-faint">
                        <LogoPlataforma plataforma={l.plataforma as 'meta' | 'google'} tamanho={13} />
                        {PLATAFORMA[l.plataforma]} · {l.conta}
                      </div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <div>{fmtMoeda(n.atual.investimento)}</div>
                    <Var v={n.anterior && variacao(n.atual.investimento, n.anterior.investimento)} neutro />
                  </td>
                  <td className="p-3">
                    <div>{fmtContagem(n.atual.leads)}</div>
                    <Var v={n.anterior && variacao(n.atual.leads, n.anterior.leads)} />
                  </td>
                  <td className="p-3">
                    <div>{fmtMoeda(n.atual.cpl)}</div>
                    <Var v={n.anterior && variacao(n.atual.cpl, n.anterior.cpl)} menorMelhor />
                  </td>
                  <td className="p-3">
                    <CelulaSaldo linha={l} />
                  </td>
                  <td className="p-3">
                    <Ritmo mes={s.mes} />
                  </td>
                  <td className="text-left p-3">
                    {s.alertas.length ? (
                      <ul className="flex flex-col gap-1">
                        {s.alertas.map((a) => (
                          <li key={a.tipo} className={`text-xs ${a.nivel === 'critico' ? 'text-bad' : 'text-[var(--warn)]'}`}>
                            {a.nivel === 'critico' ? '🔴' : '🟡'} {a.texto}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-ok">✓ Tudo certo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: 'bad' | 'warn' }) {
  const cor = destaque === 'bad' ? 'text-bad' : destaque === 'warn' ? 'text-[var(--warn)]' : '';
  return (
    // Em linha (rótulo à esquerda, número à direita): mesma altura dos botões
    // Meta Ads / Google Ads que dividem a faixa com estes cards.
    <div className="card px-4 h-10 flex items-center justify-between gap-3">
      <span className="text-xs text-muted whitespace-nowrap">{rotulo}</span>
      <span className={`text-base font-semibold tabular-nums ${cor}`}>{valor}</span>
    </div>
  );
}

function Var({ v, menorMelhor, neutro }: { v: number | null; menorMelhor?: boolean; neutro?: boolean }) {
  if (v == null) return <div className="text-xs text-faint">—</div>;
  const bom = v === 0 ? null : menorMelhor ? v < 0 : v > 0;
  const cor = neutro || bom == null ? 'text-muted' : bom ? 'text-ok' : 'text-bad';
  return (
    <div className={`text-xs ${cor}`}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '='} {fmtDecimal(Math.abs(v))}%
    </div>
  );
}

// Barra: gasto do mês até agora sobre a verba; a marca é a projeção de fechamento.
function Ritmo({ mes }: { mes: Saude['mes'] }) {
  if (!mes.verba) {
    return (
      <>
        <div>{fmtMoeda(mes.gasto)}</div>
        <div className="text-xs text-faint">sem verba definida</div>
      </>
    );
  }
  // Barra inteira = verba. Gasto e projeção na mesma escala, presos no fim.
  const gasto = Math.min(mes.gasto / mes.verba, 1);
  const proj = Math.min(mes.projecao / mes.verba, 1);
  const fora = mes.percentual != null && (mes.percentual > 1.1 || mes.percentual < 0.8);
  return (
    <div className="inline-flex flex-col items-end gap-1" title={`Projeção do mês: ${fmtMoeda(mes.projecao)}`}>
      <div>{fmtMoeda(mes.gasto)} <span className="text-faint">/ {fmtMoeda(mes.verba)}</span></div>
      <div className="relative w-28 h-1.5 rounded-full bg-[var(--border)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${gasto * 100}%` }} />
        <div
          className={`absolute -top-1 h-3.5 w-0.5 rounded ${fora ? 'bg-[var(--warn)]' : 'bg-[var(--muted)]'}`}
          style={{ left: `calc(${proj * 100}% - 1px)` }}
        />
      </div>
      <div className={`text-xs ${fora ? 'text-[var(--warn)]' : 'text-faint'}`}>
        projeção {Math.round((mes.percentual ?? 0) * 100)}%
      </div>
    </div>
  );
}

// Saldo + quanto dura + o tipo (boleto, teto de gastos, cartão sem teto).
function CelulaSaldo({ linha }: { linha: LinhaGeral }) {
  const sit = situacaoSaldo(linha.infoSaldo, linha.plataforma);
  const dias = linha.saude.diasDeSaldo;
  return (
    <>
      <div>{sit.tipo === 'sem_teto' ? '—' : fmtMoeda(linha.saldo)}</div>
      {dias != null && sit.alertaAplica && (
        <div className="text-xs text-muted">~{Math.max(Math.floor(dias), 0)} dias</div>
      )}
      <div className="text-[11px] text-faint" title={sit.detalhe}>{sit.rotulo}</div>
    </>
  );
}
