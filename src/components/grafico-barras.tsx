'use client';

// Barras por dia, uma série só (por isso sem legenda: o título nomeia a série).
// Investimento e leads ficam em gráficos SEPARADOS: escalas diferentes num eixo
// duplo enganam a leitura.
//
// Marcas finas com ponta arredondada de 4px, vão de 2px entre barras, grade
// discreta. Passar o mouse (ou focar com o teclado) mostra o valor do dia.

import { useState } from 'react';
import { fmtContagem, fmtData, fmtMoeda } from '@/lib/painel/formato';

// Formato por NOME, não por função: função não atravessa de server component
// para client component (o Next recusa em tempo de execução).
const FORMATOS = { moeda: fmtMoeda, contagem: fmtContagem } as const;

const ALTURA = 160;
const MARGEM = { topo: 8, base: 22, esq: 4, dir: 4 };

export function GraficoBarras({ titulo, serie, formato }: {
  titulo: string;
  serie: { data: string; valor: number }[];
  formato: keyof typeof FORMATOS;
}) {
  const formatar = FORMATOS[formato];
  const [ativo, setAtivo] = useState<number | null>(null);
  // Resumo no canto: alterna entre máximo e média a cada clique.
  const [resumo, setResumo] = useState<'max' | 'media'>('max');
  const max = Math.max(...serie.map((p) => p.valor), 0);
  // Média diária sobre TODOS os dias do período, inclusive os zerados.
  const media = serie.length ? serie.reduce((s, p) => s + p.valor, 0) / serie.length : 0;
  const largura = 100 / Math.max(serie.length, 1); // em % da área útil
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
  // Rótulos do eixo X sem colidir: no máximo ~8 datas.
  const passo = Math.ceil(serie.length / 8);
  const sel = ativo == null ? null : serie[ativo];

  return (
    <figure className="card p-4">
      <figcaption className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-medium">{titulo}</span>
        {sel ? (
          <span className="text-sm text-muted tabular-nums" aria-live="polite">
            {fmtData(sel.data)}:{' '}
            {/* Valor do dia em verde-claro da marca: é o que o olho procura. */}
            <span className="font-semibold text-accent-light">{formatar(sel.valor)}</span>
          </span>
        ) : (
          <button
            type="button"
            className="text-sm text-muted tabular-nums hover:text-foreground"
            onClick={() => setResumo((r) => (r === 'max' ? 'media' : 'max'))}
            title={resumo === 'max' ? 'Clique para ver a média diária' : 'Clique para ver o máximo'}
          >
            {resumo === 'max' ? `Máx.: ${formatar(max)}` : `Média: ${formatar(media)}/dia`} ⇄
          </button>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 100 ${ALTURA}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: ALTURA }}
        role="img"
        aria-label={`${titulo} por dia`}
        onMouseLeave={() => setAtivo(null)}
      >
        {/* Grade: 3 linhas recessivas. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0} x2={100}
            y1={MARGEM.topo + alturaUtil * (1 - f)} y2={MARGEM.topo + alturaUtil * (1 - f)}
            stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke"
          />
        ))}

        {serie.map((p, i) => {
          const h = max ? (p.valor / max) * alturaUtil : 0;
          const x = i * largura;
          return (
            <g key={p.data}>
              {/* Alvo de hover da largura toda da coluna, maior que a barra. */}
              <rect
                x={x} y={0} width={largura} height={ALTURA}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                tabIndex={0}
                aria-label={`${fmtData(p.data)}: ${formatar(p.valor)}`}
              />
              {h > 0 && (
                <path
                  d={barra(x + largura * 0.15, MARGEM.topo + alturaUtil - h, largura * 0.7, h)}
                  fill="var(--accent)"
                  opacity={ativo == null || ativo === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="relative h-4 text-[11px] text-faint tabular-nums">
        {serie.map((p, i) =>
          i % passo === 0 ? (
            <span key={p.data} className="absolute -translate-x-1/2" style={{ left: `${(i + 0.5) * largura}%` }}>
              {fmtData(p.data)}
            </span>
          ) : null,
        )}
      </div>
    </figure>
  );
}

// Retângulo com só o topo arredondado (a base fica apoiada no eixo).
// viewBox esticado na horizontal: o raio é aplicado só no eixo Y para não deformar.
function barra(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + Math.min(w / 2, 0.6)},${y} H${x + w - Math.min(w / 2, 0.6)} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
