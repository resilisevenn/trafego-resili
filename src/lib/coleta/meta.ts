// Coleta da Meta Marketing API: métricas por campanha por dia + foto do saldo.
//
// Só LÊ da Meta. Quem grava no banco é a rota /api/cron/sync. Aqui ficam as
// chamadas HTTP e a conversão da resposta para as linhas do schema `trafego`,
// separadas para a conversão ser testável sem rede.
//
// O token é o do usuário do sistema `dashboard-trafego` do BM Resili Sevenn,
// com ads_read (BRIEFING, seção 7). funding_source_details (crédito do boleto/Pix)
// só vem com permissão de GERENCIAR a conta; com "Ver desempenho" a Meta nega.
// Por isso ele é pedido à parte, só para conta pré-paga, e a recusa não derruba
// a coleta (decisão de 09/10/2026: liberar a permissão para ler o boleto).

import { lerReais } from '../painel/formato';

const GRAPH = 'https://graph.facebook.com/v23.0';

// Ordem de preferência: o primeiro tipo presente na linha vence. NÃO somar:
// "lead" já agrega o lead do formulário e o do pixel, somar contaria duas vezes.
// Conferido em 09/10/2026 nas 6 contas reais: lead = 19 = lead_grouped (8) +
// fb_pixel_lead (11); messaging_conversation_started_7d = 85, o mesmo que o
// Gerenciador mostra em "Conversas por mensagem iniciadas".
export const TIPOS_LEAD = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
];
export const TIPOS_CONVERSA = [
  'onsite_conversion.messaging_conversation_started_7d',
];

type Acao = { action_type: string; value: string };
// "Resultados" do Gerenciador: a Meta escolhe o indicador pelo objetivo da
// campanha (ex.: profile_visit_view numa campanha de tráfego para o Instagram).
type Resultado = { indicator: string; values?: { value: string }[] };

export type LinhaInsight = {
  campaign_id: string;
  campaign_name: string;
  objective?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Acao[];
  results?: Resultado[];
};

export type ContaMeta = {
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  is_prepay_account?: boolean;
  amount_spent?: string;
  spend_cap?: string;
  balance?: string;
};

export type Metrica = {
  campanha_id: string;
  data: string;
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
  resultado: number | null;
  resultado_tipo: string | null;
  parcela_impressoes: null; // métrica só do Google
  bruto: LinhaInsight;
};

export type Saldo = {
  saldo: number | null;
  teto: number | null; // limite de gastos da conta (cartão); nulo no pré-pago e sem teto
  tipo_pagamento: string;
  fonte: string;
  bruto: ContaMeta & { funding_source_details?: unknown };
};

const num = (v: string | undefined) => (v == null || v === '' ? null : Number(v));
const int = (v: string | undefined) => (v == null || v === '' ? 0 : Number(v));

function primeiraAcao(acoes: Acao[] | undefined, tipos: string[]): number | null {
  if (!acoes) return null;
  for (const tipo of tipos) {
    const a = acoes.find((x) => x.action_type === tipo);
    if (a) return Number(a.value);
  }
  return null;
}

// Primeiro indicador com valor. Sem resultado no dia: nulo (não zero), como leads.
export function resultadoDe(rs: Resultado[] | undefined) {
  const r = rs?.find((x) => x.values?.length);
  const v = r?.values?.[0]?.value;
  return v == null || v === ''
    ? { resultado: null, resultado_tipo: null }
    : { resultado: Number(v), resultado_tipo: r!.indicator };
}

export function paraMetrica(l: LinhaInsight): Metrica {
  return {
    campanha_id: l.campaign_id,
    data: l.date_start,
    investimento: num(l.spend) ?? 0,
    impressoes: int(l.impressions),
    alcance: num(l.reach),
    frequencia: num(l.frequency),
    cliques: int(l.clicks),
    ctr: num(l.ctr),
    cpc: num(l.cpc),
    cpm: num(l.cpm),
    // Nulo quando a ação não aparece: a Meta omite tipos com zero, mas também
    // omite quando a campanha nem rastreia aquilo. Zero afirmaria demais.
    leads: primeiraAcao(l.actions, TIPOS_LEAD),
    conversas: primeiraAcao(l.actions, TIPOS_CONVERSA),
    ...resultadoDe(l.results),
    parcela_impressoes: null,
    bruto: l,
  };
}

// Valores monetários da conta vêm em centavos, como string.
const centavos = (v: string | undefined) => (v == null || v === '' ? null : Number(v) / 100);

// Detalhe da forma de pagamento. Só é pedido para conta PRÉ-PAGA, e a Meta só
// devolve com permissão de gerenciar a conta (com "Ver desempenho" vem #10).
export type Financiamento = { display_string?: string; type?: number } | { erro: string } | null;

// "Saldo disponível (R$ 1.234,56 BRL)" → 1234.56. O texto exato varia por idioma
// e tipo de pagamento [PENDENTE DE VALIDAÇÃO numa conta de boleto real]: pega o
// primeiro valor depois de "R$"; sem valor reconhecível, nulo.
export function saldoDoTexto(texto: string | undefined): number | null {
  const m = texto?.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
  if (!m) return null;
  const v = lerReais(m[1]);
  return v == null || Number.isNaN(v) ? null : v;
}

export function paraSaldo(c: ContaMeta, financiamento: Financiamento = null): Saldo {
  const teto = centavos(c.spend_cap);
  const gasto = centavos(c.amount_spent) ?? 0;
  const bruto = financiamento ? { ...c, funding_source_details: financiamento } : c;

  // Pré-pago (boleto/Pix): o que importa é o crédito disponível, não o teto.
  if (c.is_prepay_account) {
    if (!financiamento || 'erro' in financiamento) {
      return { saldo: null, teto: null, tipo_pagamento: 'pre_pago', fonte: 'pre_pago_sem_permissao', bruto };
    }
    const saldo = saldoDoTexto(financiamento.display_string);
    return {
      saldo, teto: null, tipo_pagamento: 'pre_pago',
      fonte: saldo == null ? 'pre_pago_texto_desconhecido' : 'credito_pre_pago', bruto,
    };
  }

  // Cartão: só há "saldo" se a conta tiver limite de gastos (teto). spend_cap 0
  // ou vazio = sem teto: os anúncios só param se o cartão for recusado.
  if (teto) {
    return { saldo: Math.round((teto - gasto) * 100) / 100, teto, tipo_pagamento: 'pos_pago', fonte: 'spend_cap_menos_gasto', bruto };
  }
  return { saldo: null, teto: null, tipo_pagamento: 'pos_pago', fonte: 'sem_limite', bruto };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const corpo = await r.json();
  if (corpo.error) {
    // A mensagem da Graph API não contém o token.
    throw new Error(`Meta: ${corpo.error.message} (code ${corpo.error.code})`);
  }
  return corpo as T;
}

async function paginado<T>(primeira: string): Promise<T[]> {
  const itens: T[] = [];
  let url: string | undefined = primeira;
  while (url) {
    const pagina: { data: T[]; paging?: { next?: string } } = await get(url);
    itens.push(...pagina.data);
    url = pagina.paging?.next;
  }
  return itens;
}

const CAMPOS_CONTA =
  'account_id,name,currency,timezone_name,account_status,is_prepay_account,amount_spent,spend_cap,balance';

export function listarContas(token: string): Promise<ContaMeta[]> {
  const p = new URLSearchParams({ fields: CAMPOS_CONTA, limit: '100', access_token: token });
  return paginado<ContaMeta>(`${GRAPH}/me/adaccounts?${p}`);
}

// Só para conta pré-paga. Erro de permissão não derruba a coleta: vira
// { erro } e a conta aparece como "falta permissão".
export async function buscarFinanciamento(contaId: string, token: string): Promise<Financiamento> {
  const p = new URLSearchParams({ fields: 'funding_source_details', access_token: token });
  const r = await fetch(`${GRAPH}/act_${contaId}?${p}`, { signal: AbortSignal.timeout(30_000) });
  const corpo = await r.json();
  if (corpo.error) return { erro: corpo.error.message };
  return corpo.funding_source_details ?? null;
}

export type Campanha = { id: string; name: string; effective_status: string; objective?: string };

export function listarCampanhas(contaId: string, token: string): Promise<Campanha[]> {
  const p = new URLSearchParams({
    fields: 'id,name,effective_status,objective',
    limit: '200',
    access_token: token,
  });
  return paginado<Campanha>(`${GRAPH}/act_${contaId}/campaigns?${p}`);
}

const CAMPOS_INSIGHT =
  'campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,results';

export function buscarInsights(
  contaId: string,
  token: string,
  periodo: { since: string; until: string },
): Promise<LinhaInsight[]> {
  const p = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    fields: CAMPOS_INSIGHT,
    time_range: JSON.stringify(periodo),
    limit: '500',
    access_token: token,
  });
  return paginado<LinhaInsight>(`${GRAPH}/act_${contaId}/insights?${p}`);
}

// Alcance do PERÍODO inteiro por campanha, sem time_increment: a Meta conta
// pessoas únicas na janela. A soma dos alcances diários conta a mesma pessoa
// uma vez por dia (relatório 17.518 × Gerenciador 12.372 em 02 a 08/10/2026).
export async function buscarAlcancePeriodo(
  contaId: string,
  token: string,
  periodo: { since: string; until: string },
): Promise<{ campanha_id: string; alcance: number | null }[]> {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,reach',
    time_range: JSON.stringify(periodo),
    limit: '500',
    access_token: token,
  });
  const linhas = await paginado<{ campaign_id: string; reach?: string }>(`${GRAPH}/act_${contaId}/insights?${p}`);
  return linhas.map((l) => ({ campanha_id: l.campaign_id, alcance: num(l.reach) }));
}
