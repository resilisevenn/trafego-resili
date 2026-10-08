// Coleta da Meta Marketing API: métricas por campanha por dia + foto do saldo.
//
// Só LÊ da Meta. Quem grava no banco é a rota /api/cron/sync. Aqui ficam as
// chamadas HTTP e a conversão da resposta para as linhas do schema `trafego`,
// separadas para a conversão ser testável sem rede.
//
// O token é o do usuário do sistema `dashboard-trafego` do BM Resili Sevenn,
// com ads_read e "Ver desempenho" nas contas (BRIEFING, seção 7). Com essa
// permissão a Meta NEGA funding_source_details: não pedimos esse campo.

const GRAPH = 'https://graph.facebook.com/v23.0';

// Ordem de preferência: o primeiro tipo presente na linha vence. NÃO somar:
// "lead" já agrega o lead do formulário e o do pixel, somar contaria duas vezes.
// Lista ainda não conferida em conta de cliente com leads [PENDENTE DE
// VALIDAÇÃO]. Se mudar, dá para recalcular a partir de `bruto`.
export const TIPOS_LEAD = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
];
export const TIPOS_CONVERSA = [
  'onsite_conversion.messaging_conversation_started_7d',
];

type Acao = { action_type: string; value: string };

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
  bruto: LinhaInsight;
};

export type Saldo = {
  saldo: number | null;
  tipo_pagamento: string;
  fonte: string;
  bruto: ContaMeta;
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
    bruto: l,
  };
}

// Valores monetários da conta vêm em centavos, como string.
const centavos = (v: string | undefined) => (v == null || v === '' ? null : Number(v) / 100);

export function paraSaldo(c: ContaMeta): Saldo {
  const teto = centavos(c.spend_cap);
  const gasto = centavos(c.amount_spent) ?? 0;
  const tipo_pagamento = c.is_prepay_account ? 'pre_pago' : 'pos_pago';
  // spend_cap 0 ou vazio = conta sem limite: não há saldo a mostrar.
  if (teto) {
    return {
      saldo: Math.round((teto - gasto) * 100) / 100,
      tipo_pagamento,
      fonte: 'spend_cap_menos_gasto',
      bruto: c,
    };
  }
  return { saldo: null, tipo_pagamento, fonte: 'sem_limite', bruto: c };
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
  'campaign_id,campaign_name,objective,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions';

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
