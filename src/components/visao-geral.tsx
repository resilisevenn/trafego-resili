// Visão geral: todas as contas que o usuário vê, numa tabela só, ordenada por
// quem precisa de ação. É a "tela da manhã" do gestor. Só recebe dados prontos:
// quem busca é a página real (banco, com RLS) ou a prévia local.

import Link from 'next/link';
import { variacao } from '@/lib/painel/agregar';
import type { Saude } from '@/lib/painel/saude';
import { fmtContagem, fmtDecimal, fmtMoeda } from '@/lib/painel/formato';

export type LinhaGeral = {
  contaId: string;
  cliente: string;
  conta: string;
  plataforma: string;
  saldo: number | null;
  saude: Saude;
};

const PLATAFORMA: Record<string, string> = { meta: 'Meta', google: 'Google' };

export function VisaoGeral({ linhas, hrefConta }: { linhas: LinhaGeral[]; hrefConta: (id: string) => string }) {
  const criticos = linhas.filter((l) => l.saude.alertas.some((a) => a.nivel === 'critico')).length;
  const atencao = linhas.filter((l) => l.saude.alertas.length && !l.saude.alertas.some((a) => a.nivel === 'critico')).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h1 className="text-lg font-semibold">Visão geral</h1>
        <p className="text-sm text-muted">
          Últimos 7 dias fechados (até ontem), comparados com os 7 anteriores.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-3 max-w-xl">
        <Resumo rotulo="Contas" valor={linhas.length} />
        <Resumo rotulo="🔴 Ação agora" valor={criticos} destaque={criticos > 0 ? 'bad' : undefined} />
        <Resumo rotulo="🟡 Atenção" valor={atencao} destaque={atencao > 0 ? 'warn' : undefined} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted text-right">
            <tr className="border-b border-border">
              <th className="text-left p-3 font-medium">Clínica / conta</th>
              <th className="p-3 font-medium">Investimento 7d</th>
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
              return (
                <tr key={l.contaId} className="border-b border-border last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="text-left p-3">
                    <Link href={hrefConta(l.contaId)} className="hover:underline">
                      <div className="font-medium">{l.cliente}</div>
                      <div className="text-xs text-faint">{PLATAFORMA[l.plataforma]} · {l.conta}</div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <div>{fmtMoeda(s.semana.investimento)}</div>
                    <Var v={variacao(s.semana.investimento, s.semanaAnterior.investimento)} neutro />
                  </td>
                  <td className="p-3">
                    <div>{fmtContagem(s.semana.leads)}</div>
                    <Var v={variacao(s.semana.leads, s.semanaAnterior.leads)} />
                  </td>
                  <td className="p-3">
                    <div>{fmtMoeda(s.semana.cpl)}</div>
                    <Var v={variacao(s.semana.cpl, s.semanaAnterior.cpl)} menorMelhor />
                  </td>
                  <td className="p-3">
                    <div>{fmtMoeda(l.saldo)}</div>
                    <div className="text-xs text-faint">
                      {s.diasDeSaldo == null ? '—' : `~${Math.max(Math.floor(s.diasDeSaldo), 0)} dias`}
                    </div>
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
    <div className="card p-4">
      <div className="text-xs text-muted">{rotulo}</div>
      <div className={`text-2xl font-semibold tabular-nums ${cor}`}>{valor}</div>
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
