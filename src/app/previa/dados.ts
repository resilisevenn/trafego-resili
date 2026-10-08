// Dados FICTÍCIOS da prévia local. Nenhum cliente real.
// Cada conta exercita um caso: saldo baixo, verba estourando, coleta com erro
// e conta parada, conta nova sem dados.

import type { OpcaoConta } from '@/components/seletor';
import type { LinhaMetrica } from '@/lib/painel/agregar';

export type ContaFicticia = OpcaoConta & {
  limite: number | null; saldo: number | null; fonte: string; erro?: string;
  verba: number | null; cplMeta: number | null; paradaOntem?: boolean;
};

export const CONTAS: ContaFicticia[] = [
  { id: 'a-meta', nome: 'Conta Meta A', plataforma: 'meta', cliente: 'Clínica Exemplo A', limite: 500, saldo: 321.09, fonte: 'spend_cap_menos_gasto', verba: 1500, cplMeta: 15 },
  { id: 'a-google', nome: 'Conta Google A', plataforma: 'google', cliente: 'Clínica Exemplo A', limite: 200, saldo: 1840.5, fonte: 'account_budget', verba: 1700, cplMeta: null },
  { id: 'b-meta', nome: 'Conta Meta B', plataforma: 'meta', cliente: 'Clínica Exemplo B', limite: null, saldo: null, fonte: 'sem_limite', erro: '(#17) User request limit reached', verba: null, cplMeta: null, paradaOntem: true },
  { id: 'novo', nome: 'Conta recém-chegada', plataforma: 'google', cliente: 'Sem cliente', limite: null, saldo: null, fonte: 'sem_account_budget', verba: null, cplMeta: null },
];

export const CAMPANHAS: Record<string, [string, string][]> = {
  'a-meta': [['m1', 'LEADS - Formulário - Harmonização'], ['m2', 'MENSAGENS - WhatsApp - Botox'], ['m3', 'RECONHECIMENTO - Vídeo']],
  'a-google': [['g1', '[Search] Harmonização Facial'], ['g2', '[Search] Lentes de Contato Dental']],
  'b-meta': [['b1', 'LEADS - Avaliação gratuita']],
  novo: [],
};

// Pseudoaleatório determinístico: mesma semente, mesmos números a cada recarga.
function sorteio(semente: string) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
}

export function linhasFicticias(contaId: string, plataforma: string, dias: string[], ontem?: string): LinhaMetrica[] {
  const parada = CONTAS.find((c) => c.id === contaId)?.paradaOntem;
  return CAMPANHAS[contaId].flatMap(([id], i) =>
    // Conta "parada": nenhuma linha ontem nem hoje (é o que a coleta grava quando não veicula).
    dias.filter((d) => !(parada && ontem && d >= ontem)).map((data) => {
      const r = sorteio(`${contaId}${id}${data}`);
      const impressoes = Math.round((plataforma === 'meta' ? 3000 : 150) * (0.5 + r()) / (i + 1));
      const cliques = Math.round(impressoes * (plataforma === 'meta' ? 0.012 : 0.09) * (0.6 + r()));
      return {
        campanha_id: id,
        data,
        investimento: Math.round((plataforma === 'meta' ? 45 : 30) * (0.5 + r()) / (i + 1) * 100) / 100,
        impressoes,
        alcance: plataforma === 'meta' ? Math.round(impressoes / (1.1 + r() * 0.5)) : null,
        cliques,
        leads: id === 'm3' ? null : Math.round(cliques * 0.15 * r()),
        conversas: plataforma === 'meta' && id === 'm2' ? Math.round(cliques * 0.3 * r()) : null,
        parcela_impressoes: plataforma === 'google' ? Math.round((0.3 + r() * 0.7) * 100) / 100 : null,
      };
    }),
  );
}

