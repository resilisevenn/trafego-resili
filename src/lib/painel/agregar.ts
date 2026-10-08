// Cálculos do dashboard a partir das linhas de trafego.metricas_diarias.
// Puro, sem banco: a página busca as linhas e entrega aqui.

export type LinhaMetrica = {
  campanha_id: string;
  data: string;
  investimento: number;
  impressoes: number;
  alcance: number | null;
  cliques: number;
  leads: number | null;
  conversas: number | null;
};

export type Periodo = { de: string; ate: string };

// ── Período ──────────────────────────────────────────────────────────────────

const dia = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
function somaDias(s: string, n: number) {
  const d = dia(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
const diasEntre = (a: string, b: string) => Math.round((dia(b).getTime() - dia(a).getTime()) / 864e5) + 1;

export type ChavePeriodo = '7d' | '30d' | 'mes' | 'custom';

// Períodos fechados em ONTEM: hoje ainda está acumulando e puxaria a média
// para baixo. O "mês atual" é a exceção: vai até hoje, como o Gerenciador.
export function resolverPeriodo(chave: string | undefined, hoje: string, de?: string, ate?: string): Periodo & { chave: ChavePeriodo } {
  const ontem = somaDias(hoje, -1);
  if (chave === 'custom' && de && ate && /^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate) && de <= ate) {
    return { chave: 'custom', de, ate };
  }
  if (chave === '30d') return { chave: '30d', de: somaDias(ontem, -29), ate: ontem };
  if (chave === 'mes') return { chave: 'mes', de: `${hoje.slice(0, 8)}01`, ate: hoje };
  return { chave: '7d', de: somaDias(ontem, -6), ate: ontem };
}

// Mesmo número de dias, imediatamente antes.
export function periodoAnterior(p: Periodo): Periodo {
  const n = diasEntre(p.de, p.ate);
  return { de: somaDias(p.de, -n), ate: somaDias(p.de, -1) };
}

export function diasDoPeriodo(p: Periodo): string[] {
  return Array.from({ length: diasEntre(p.de, p.ate) }, (_, i) => somaDias(p.de, i));
}

// ── Totais ───────────────────────────────────────────────────────────────────

export type Totais = {
  investimento: number;
  impressoes: number;
  alcance: number | null;
  frequencia: number | null;
  cliques: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number | null;
  conversas: number | null;
};

// Soma que fica nula se NENHUMA linha tem o valor: "—" e 0 dizem coisas diferentes.
function somaOpcional(linhas: LinhaMetrica[], campo: 'alcance' | 'leads' | 'conversas') {
  const com = linhas.filter((l) => l[campo] != null);
  return com.length ? com.reduce((s, l) => s + Number(l[campo]), 0) : null;
}

const div = (a: number, b: number) => (b ? a / b : null);

export function totais(linhas: LinhaMetrica[]): Totais {
  const investimento = linhas.reduce((s, l) => s + Number(l.investimento), 0);
  const impressoes = linhas.reduce((s, l) => s + Number(l.impressoes), 0);
  const cliques = linhas.reduce((s, l) => s + Number(l.cliques), 0);
  // ATENÇÃO: alcance é a SOMA dos alcances diários. A mesma pessoa alcançada em
  // dois dias conta duas vezes, então isto superestima o alcance do período e
  // subestima a frequência. O número exato exige outra consulta à Meta.
  const alcance = somaOpcional(linhas, 'alcance');
  return {
    investimento,
    impressoes,
    alcance,
    frequencia: alcance ? impressoes / alcance : null,
    cliques,
    // Recalculados dos totais. Média das taxas diárias daria peso igual a um
    // dia de 10 impressões e a um de 10 mil.
    ctr: div(cliques * 100, impressoes),
    cpc: div(investimento, cliques),
    cpm: div(investimento * 1000, impressoes),
    leads: somaOpcional(linhas, 'leads'),
    conversas: somaOpcional(linhas, 'conversas'),
  };
}

// Variação % contra o período anterior. Nula quando não há base para comparar.
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

// ── Séries e tabela ──────────────────────────────────────────────────────────

export function seriePorDia(linhas: LinhaMetrica[], p: Periodo, campo: 'investimento' | 'leads') {
  const porDia = new Map<string, number | null>();
  for (const l of linhas) {
    const v = l[campo];
    if (v == null) continue;
    porDia.set(l.data, (porDia.get(l.data) ?? 0) + Number(v));
  }
  // Dia sem linha = sem veiculação = 0 (não lacuna): a coleta grava todo dia com dado.
  return diasDoPeriodo(p).map((d) => ({ data: d, valor: porDia.get(d) ?? 0 }));
}

export function porCampanha(linhas: LinhaMetrica[]) {
  const grupos = new Map<string, LinhaMetrica[]>();
  for (const l of linhas) grupos.set(l.campanha_id, [...(grupos.get(l.campanha_id) ?? []), l]);
  return [...grupos]
    .map(([campanha_id, ls]) => ({ campanha_id, ...totais(ls) }))
    .sort((a, b) => b.investimento - a.investimento);
}
