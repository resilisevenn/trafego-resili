import { describe, expect, it } from 'vitest';
import { credDoAmbiente, paraMetrica, paraSaldo, type LinhaCampanha } from './google';

const linha: LinhaCampanha = {
  campaign: { id: '111', name: 'Pesquisa', status: 'ENABLED' },
  segments: { date: '2026-10-07' },
  metrics: {
    costMicros: '45670000',
    impressions: '1200',
    clicks: '60',
    ctr: 0.05,
    averageCpc: 761166.67,
    averageCpm: 38058333.33,
    conversions: 3.5,
  },
};

describe('paraMetrica (Google)', () => {
  it('converte micros, CTR em % e conversões fracionadas', () => {
    expect(paraMetrica(linha)).toMatchObject({
      campanha_id: '111', data: '2026-10-07', investimento: 45.67, impressoes: 1200, cliques: 60,
      ctr: 5, leads: 3.5,
    });
    expect(paraMetrica(linha).cpc).toBeCloseTo(0.7612, 4);
    expect(paraMetrica(linha).cpm).toBeCloseTo(38.0583, 4);
  });

  it('alcance, frequência e conversas ficam nulos: o Google não informa', () => {
    expect(paraMetrica(linha)).toMatchObject({ alcance: null, frequencia: null, conversas: null });
  });

  it('métricas ausentes viram 0 ou nulo, sem NaN', () => {
    const m = paraMetrica({ ...linha, metrics: {} });
    expect(m).toMatchObject({ investimento: 0, impressoes: 0, cliques: 0, ctr: null, cpc: null, leads: null });
  });
});

describe('paraSaldo (Google)', () => {
  it('limite ajustado − gasto (números reais do Dr Arlan em 08/10/2026)', () => {
    const s = paraSaldo([{
      id: '1', status: 'APPROVED', approvedSpendingLimitMicros: '25380740000',
      adjustedSpendingLimitMicros: '25380740000', amountServedMicros: '23096720000',
    }]);
    expect(s).toMatchObject({ saldo: 2284.02, fonte: 'account_budget' });
  });

  it('INFINITE: saldo nulo (caso da RVF)', () => {
    const s = paraSaldo([{ id: '1', status: 'APPROVED', approvedSpendingLimitType: 'INFINITE', amountServedMicros: '1257730000' }]);
    expect(s).toMatchObject({ saldo: null, fonte: 'sem_limite' });
  });

  it('usa o orçamento aprovado mais recente e ignora os outros status', () => {
    const s = paraSaldo([
      { id: 'velho', status: 'APPROVED', adjustedSpendingLimitMicros: '1000000000', amountServedMicros: '0', approvedStartDateTime: '2025-01-01 00:00:00' },
      { id: 'novo', status: 'APPROVED', adjustedSpendingLimitMicros: '2000000000', amountServedMicros: '500000000', approvedStartDateTime: '2026-08-01 00:00:00' },
      { id: 'pendente', status: 'PENDING', adjustedSpendingLimitMicros: '9000000000', approvedStartDateTime: '2026-10-01 00:00:00' },
    ]);
    expect(s.saldo).toBe(1500);
  });

  it('sem orçamento de conta: saldo nulo', () => {
    expect(paraSaldo([])).toMatchObject({ saldo: null, fonte: 'sem_account_budget' });
  });
});

describe('credDoAmbiente', () => {
  const env = {
    GOOGLE_ADS_DEVELOPER_TOKEN: 'a', GOOGLE_ADS_CLIENT_ID: 'b', GOOGLE_ADS_CLIENT_SECRET: 'c',
    GOOGLE_ADS_REFRESH_TOKEN: 'd', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '123-456-7890',
  };
  it('tira o hífen do ID da MCC', () => {
    expect(credDoAmbiente(env)?.loginCustomerId).toBe('1234567890');
  });
  it('nulo se faltar qualquer variável', () => {
    expect(credDoAmbiente({ ...env, GOOGLE_ADS_REFRESH_TOKEN: undefined })).toBeNull();
  });
});
