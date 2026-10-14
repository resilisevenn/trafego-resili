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
  parcela_impressoes?: number | null; // só Google; fração 0–1
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

export const PERIODOS = [
  ['hoje', 'Hoje'],
  ['ontem', 'Ontem'],
  ['semana', 'Esta semana'],
  ['semana_anterior', 'Semana anterior'],
  ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias'],
  ['mes', 'Este mês'],
  ['mes_anterior', 'Último mês'],
  ['ano', 'Este ano'],
  ['max', 'Máximo'],
  ['custom', 'Personalizado'],
] as const;

export type ChavePeriodo = (typeof PERIODOS)[number][0];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Semana começa na SEGUNDA. getUTCDay: 0 = domingo.
function segundaDaSemana(s: string) {
  const dow = dia(s).getUTCDay();
  return somaDias(s, -((dow + 6) % 7));
}

function ultimoDiaDoMes(anoMes: string) {
  const [a, m] = anoMes.split('-').map(Number);
  return iso(new Date(Date.UTC(a, m, 0, 12)));
}

function mesAnterior(anoMes: string) {
  const [a, m] = anoMes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

// "Últimos N dias" fecham em ONTEM: hoje ainda está acumulando e puxaria a média
// para baixo. Os períodos de calendário ("esta semana", "este mês", "este ano")
// vão até hoje, como no Gerenciador. "Máximo" começa no primeiro dia com dado.
export function resolverPeriodo(
  chave: string | undefined, hoje: string, de?: string, ate?: string, inicioDados?: string,
): Periodo & { chave: ChavePeriodo } {
  const ontem = somaDias(hoje, -1);
  switch (chave) {
    case 'custom':
      if (de && ate && DATA.test(de) && DATA.test(ate) && de <= ate) return { chave, de, ate };
      break;
    case 'hoje':
      return { chave, de: hoje, ate: hoje };
    case 'ontem':
      return { chave, de: ontem, ate: ontem };
    case 'semana':
      return { chave, de: segundaDaSemana(hoje), ate: hoje };
    case 'semana_anterior': {
      const seg = somaDias(segundaDaSemana(hoje), -7);
      return { chave, de: seg, ate: somaDias(seg, 6) };
    }
    case '30d':
      return { chave, de: somaDias(ontem, -29), ate: ontem };
    case 'mes':
      return { chave, de: `${hoje.slice(0, 8)}01`, ate: hoje };
    case 'mes_anterior': {
      const m = mesAnterior(hoje.slice(0, 7));
      return { chave, de: `${m}-01`, ate: ultimoDiaDoMes(m) };
    }
    case 'ano':
      return { chave, de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
    case 'max':
      return { chave, de: inicioDados && inicioDados <= hoje ? inicioDados : hoje, ate: hoje };
  }
  return { chave: '7d', de: somaDias(ontem, -6), ate: ontem };
}

// Período de comparação. Calendário compara com o MESMO trecho do anterior
// (esta semana até quarta × semana passada até quarta), para não comparar 3
// dias com 7. "Máximo" não tem anterior: as variações ficam em "—".
export function periodoAnterior(p: Periodo & { chave?: string }): Periodo | null {
  const n = diasEntre(p.de, p.ate);
  switch (p.chave) {
    case 'max':
      return null;
    case 'semana':
    case 'semana_anterior':
      return { de: somaDias(p.de, -7), ate: somaDias(p.ate, -7) };
    case 'mes':
    case 'mes_anterior': {
      const m = mesAnterior(p.de.slice(0, 7));
      const fim = ultimoDiaDoMes(m);
      // Mês corrente até dia 31 × mês anterior de 30 dias: corta no último dia dele.
      const ate = p.chave === 'mes_anterior' ? fim : `${m}-${p.ate.slice(8)}` > fim ? fim : `${m}-${p.ate.slice(8)}`;
      return { de: `${m}-01`, ate };
    }
    case 'ano': {
      const a = Number(p.de.slice(0, 4)) - 1;
      // 29/02 em ano bissexto vira 28/02 no ano anterior.
      const ate = p.ate.slice(5) === '02-29' ? `${a}-02-28` : `${a}-${p.ate.slice(5)}`;
      return { de: `${a}-01-01`, ate };
    }
  }
  return { de: somaDias(p.de, -n), ate: somaDias(p.de, -1) };
}

// Linhas dentro de um período (datas inclusivas).
export function entre(linhas: LinhaMetrica[], p: Periodo): LinhaMetrica[] {
  return linhas.filter((l) => l.data >= p.de && l.data <= p.ate);
}

// "01/10 a 07/10 · comparado com 24/09 a 30/09" (um dia só: "08/10").
export function descreverPeriodo(p: Periodo, anterior: Periodo | null): string {
  const dm = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}`;
  const um = (x: Periodo) => (x.de === x.ate ? dm(x.de) : `${dm(x.de)} a ${dm(x.ate)}`);
  return anterior ? `${um(p)} · comparado com ${um(anterior)}` : um(p);
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
  cpl: number | null;
  conversas: number | null;
  custo_conversa: number | null; // investimento ÷ conversas
  // "Resultado" da conta: o LEAD quando houver leads; senão a CONVERSA (contas de
  // mensagem). Decisão de 09/10/2026: lead é o principal quando há os dois.
  // Visão geral, alertas e a meta de custo usam este par.
  tipo_resultado: 'lead' | 'conversa' | null;
  resultados: number | null;
  custo_resultado: number | null;
  taxa_conversao: number | null; // leads ÷ cliques, em %
  parcela_impressoes: number | null; // em %
};

// Soma que fica nula se NENHUMA linha tem o valor: "—" e 0 dizem coisas diferentes.
function somaOpcional(linhas: LinhaMetrica[], campo: 'alcance' | 'leads' | 'conversas') {
  const com = linhas.filter((l) => l[campo] != null);
  return com.length ? com.reduce((s, l) => s + Number(l[campo]), 0) : null;
}

const div = (a: number, b: number) => (b ? a / b : null);

// Parcela de impressões do período = impressões ganhas ÷ impressões possíveis.
// Possíveis de cada dia = impressões ÷ parcela do dia. Média simples das
// parcelas daria o mesmo peso a um dia de 2 impressões e a um de 200.
function parcelaPonderada(linhas: LinhaMetrica[]): number | null {
  let ganhas = 0;
  let possiveis = 0;
  for (const l of linhas) {
    if (!l.parcela_impressoes || !l.impressoes) continue;
    ganhas += Number(l.impressoes);
    possiveis += Number(l.impressoes) / Number(l.parcela_impressoes);
  }
  return possiveis ? (ganhas / possiveis) * 100 : null;
}

export function totais(linhas: LinhaMetrica[]): Totais {
  const investimento = linhas.reduce((s, l) => s + Number(l.investimento), 0);
  const impressoes = linhas.reduce((s, l) => s + Number(l.impressoes), 0);
  const cliques = linhas.reduce((s, l) => s + Number(l.cliques), 0);
  // ATENÇÃO: alcance é a SOMA dos alcances diários. A mesma pessoa alcançada em
  // dois dias conta duas vezes, então isto superestima o alcance do período e
  // subestima a frequência. O número exato exige outra consulta à Meta.
  const alcance = somaOpcional(linhas, 'alcance');
  const leads = somaOpcional(linhas, 'leads');
  const conversas = somaOpcional(linhas, 'conversas');
  const tipo = leads ? 'lead' : conversas ? 'conversa' : null;
  const resultados = tipo === 'lead' ? leads : tipo === 'conversa' ? conversas : null;
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
    leads,
    // Custo por lead: nulo sem leads (dividir por zero não é "R$ 0").
    cpl: leads ? investimento / leads : null,
    taxa_conversao: leads != null && cliques ? (leads * 100) / cliques : null,
    parcela_impressoes: parcelaPonderada(linhas),
    conversas,
    custo_conversa: conversas ? investimento / conversas : null,
    tipo_resultado: tipo,
    resultados,
    custo_resultado: resultados ? investimento / resultados : null,
  };
}

// Variação % contra o período anterior. Nula quando não há base para comparar.
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

// ── Séries e tabela ──────────────────────────────────────────────────────────

export function seriePorDia(linhas: LinhaMetrica[], p: Periodo, campo: 'investimento' | 'leads' | 'conversas') {
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
    // A Meta devolve linha zerada para campanha pausada no meio da janela (ex.:
    // [GPV] da Dra Isadora em 07–08/10). Sem gasto e sem impressão no período,
    // ela não diz nada e só polui a tabela.
    .filter((c) => c.investimento > 0 || c.impressoes > 0)
    .sort((a, b) => b.investimento - a.investimento);
}
