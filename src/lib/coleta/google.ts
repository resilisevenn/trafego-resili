// Coleta do Google Ads pela MCC: métricas por campanha por dia + saldo.
//
// Só LÊ do Google. REST direto (googleAds:searchStream): não há biblioteca
// oficial do Google Ads para Node. Mesma divisão do meta.ts: HTTP de um lado,
// conversão testável do outro.
//
// O Google NÃO tem alcance nem frequência no nível de campanha comum
// (BRIEFING, seção 6): ficam nulos e a tela mostra "—". Não inventar.

const API = 'https://googleads.googleapis.com/v25';

export type CredGoogle = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string; // a MCC, 10 dígitos sem hífen
};

export function credDoAmbiente(env: Record<string, string | undefined> = process.env): CredGoogle | null {
  const c = {
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId: env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN,
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, ''),
  };
  return Object.values(c).every(Boolean) ? (c as CredGoogle) : null;
}

// ── Conversão ────────────────────────────────────────────────────────────────

// int64 vem como string no JSON da API REST.
const micros = (v: string | number | undefined) => (v == null ? null : Number(v) / 1e6);

export type LinhaCampanha = {
  campaign: { id: string; name: string; status: string; advertisingChannelType?: string };
  segments: { date: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    ctr?: number;
    averageCpc?: number;
    averageCpm?: number;
    conversions?: number;
  };
};

export function paraMetrica(l: LinhaCampanha) {
  const m = l.metrics;
  return {
    campanha_id: l.campaign.id,
    data: l.segments.date,
    investimento: Math.round((micros(m.costMicros) ?? 0) * 100) / 100,
    impressoes: Number(m.impressions ?? 0),
    alcance: null,
    frequencia: null,
    cliques: Number(m.clicks ?? 0),
    // O Google devolve CTR como fração (0,05); a Meta, em % (5). Gravamos em %.
    ctr: m.ctr == null ? null : m.ctr * 100,
    cpc: micros(m.averageCpc),
    cpm: micros(m.averageCpm),
    // Conversões do Google = o que a conta marcou como conversão. Pode ser
    // fracionado (atribuição). Não há "conversas" separadas no Google.
    leads: m.conversions ?? null,
    conversas: null,
    bruto: l,
  };
}

export type OrcamentoConta = {
  id: string;
  status: string;
  approvedSpendingLimitMicros?: string;
  approvedSpendingLimitType?: string;
  adjustedSpendingLimitMicros?: string;
  amountServedMicros?: string;
  approvedStartDateTime?: string;
};

// Saldo = limite (ajustado, senão aprovado) − gasto do orçamento da conta
// APROVADO mais recente. INFINITE ou sem orçamento: saldo nulo (Plano B).
// Ainda falta confirmar contra o painel de faturamento [PENDENTE DE VALIDAÇÃO].
export function paraSaldo(orcamentos: OrcamentoConta[]) {
  const vigente = orcamentos
    .filter((o) => o.status === 'APPROVED')
    .sort((a, b) => (b.approvedStartDateTime ?? '').localeCompare(a.approvedStartDateTime ?? ''))[0];

  if (!vigente) return { saldo: null, tipo_pagamento: 'desconhecido', fonte: 'sem_account_budget', bruto: { orcamentos } };

  const limite = Number(vigente.adjustedSpendingLimitMicros ?? vigente.approvedSpendingLimitMicros ?? 0);
  if (vigente.approvedSpendingLimitType === 'INFINITE' || !limite) {
    return { saldo: null, tipo_pagamento: 'account_budget', fonte: 'sem_limite', bruto: { orcamentos } };
  }
  const gasto = Number(vigente.amountServedMicros ?? 0);
  return {
    saldo: Math.round((limite - gasto) / 1e4) / 100,
    tipo_pagamento: 'account_budget',
    fonte: 'account_budget',
    bruto: { orcamentos },
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function tokenDeAcesso(c: CredGoogle): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const corpo = await r.json();
  // A resposta de erro do OAuth não ecoa o refresh token.
  if (!r.ok) throw new Error(`Google OAuth: ${corpo.error_description ?? corpo.error}`);
  return corpo.access_token;
}

export async function consultar<T>(c: CredGoogle, acesso: string, customerId: string, gaql: string): Promise<T[]> {
  const r = await fetch(`${API}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${acesso}`,
      'developer-token': c.developerToken,
      'login-customer-id': c.loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gaql }),
    signal: AbortSignal.timeout(60_000),
  });
  const corpo = await r.json();
  if (!r.ok) {
    const e = Array.isArray(corpo) ? corpo[0]?.error : corpo.error;
    const detalhe = e?.details?.[0]?.errors?.[0]?.message;
    throw new Error(`Google Ads: ${detalhe ?? e?.message ?? r.status}`);
  }
  // searchStream devolve uma lista de lotes, cada um com `results`.
  return (corpo as { results?: T[] }[]).flatMap((lote) => lote.results ?? []);
}

export type ContaGoogle = {
  customerClient: { id: string; descriptiveName: string; currencyCode: string; timeZone: string; status: string };
};

export function listarContas(c: CredGoogle, acesso: string) {
  return consultar<ContaGoogle>(c, acesso, c.loginCustomerId, `
    SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
           customer_client.time_zone, customer_client.status
    FROM customer_client
    WHERE customer_client.manager = FALSE AND customer_client.level >= 1`);
}

export function buscarCampanhas(
  c: CredGoogle, acesso: string, customerId: string, periodo: { since: string; until: string },
) {
  // Datas vêm de janela(): AAAA-MM-DD, sem entrada do usuário.
  return consultar<LinhaCampanha>(c, acesso, customerId, `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${periodo.since}' AND '${periodo.until}'`);
}

export async function buscarOrcamentos(c: CredGoogle, acesso: string, customerId: string) {
  const linhas = await consultar<{ accountBudget: OrcamentoConta }>(c, acesso, customerId, `
    SELECT account_budget.id, account_budget.status,
           account_budget.approved_spending_limit_micros, account_budget.approved_spending_limit_type,
           account_budget.adjusted_spending_limit_micros, account_budget.amount_served_micros,
           account_budget.approved_start_date_time
    FROM account_budget`);
  return linhas.map((l) => l.accountBudget);
}
