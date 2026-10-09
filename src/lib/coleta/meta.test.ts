import { describe, expect, it } from 'vitest';
import { paraMetrica, paraSaldo, saldoDoTexto, type ContaMeta, type LinhaInsight } from './meta';

const base: LinhaInsight = {
  campaign_id: '1',
  campaign_name: 'Camp',
  date_start: '2026-10-07',
  spend: '26.77',
  impressions: '1000',
  reach: '800',
  frequency: '1.25',
  clicks: '33',
  ctr: '3.3',
  cpc: '0.81',
  cpm: '26.77',
};

describe('paraMetrica', () => {
  it('converte os campos numéricos', () => {
    const m = paraMetrica(base);
    expect(m).toMatchObject({
      campanha_id: '1', data: '2026-10-07', investimento: 26.77, impressoes: 1000,
      alcance: 800, frequencia: 1.25, cliques: 33, ctr: 3.3, cpc: 0.81, cpm: 26.77,
    });
  });

  it('leads e conversas nulos quando a Meta não manda a ação', () => {
    const m = paraMetrica({ ...base, actions: [{ action_type: 'link_click', value: '33' }] });
    expect(m.leads).toBeNull();
    expect(m.conversas).toBeNull();
  });

  it('usa "lead" e não soma com os tipos que ele já agrega', () => {
    const m = paraMetrica({
      ...base,
      actions: [
        { action_type: 'offsite_conversion.fb_pixel_lead', value: '3' },
        { action_type: 'lead', value: '5' },
        { action_type: 'onsite_conversion.lead_grouped', value: '2' },
      ],
    });
    expect(m.leads).toBe(5);
  });

  it('cai para o tipo seguinte quando "lead" não vem', () => {
    const m = paraMetrica({ ...base, actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '2' }] });
    expect(m.leads).toBe(2);
  });

  it('conta conversas de mensagem', () => {
    const m = paraMetrica({
      ...base,
      actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }],
    });
    expect(m.conversas).toBe(4);
  });

  it('campos ausentes: investimento 0, métricas de taxa nulas', () => {
    const m = paraMetrica({ campaign_id: '1', campaign_name: 'x', date_start: '2026-10-07' });
    expect(m).toMatchObject({ investimento: 0, impressoes: 0, cliques: 0, alcance: null, ctr: null, cpc: null });
  });
});

describe('paraSaldo', () => {
  const conta: ContaMeta = {
    account_id: '678147093607200', name: 'C.A', currency: 'BRL',
    timezone_name: 'America/Sao_Paulo', account_status: 1,
  };

  it('com limite: limite − gasto, em reais (a Meta manda centavos)', () => {
    // Números do teste real de 08/10/2026 (BRIEFING, seção 7).
    const s = paraSaldo({ ...conta, spend_cap: '200000', amount_spent: '3173', is_prepay_account: false });
    expect(s).toMatchObject({ saldo: 1968.27, teto: 2000, fonte: 'spend_cap_menos_gasto', tipo_pagamento: 'pos_pago' });
  });

  it('sem limite (spend_cap 0): saldo nulo, não zero', () => {
    const s = paraSaldo({ ...conta, spend_cap: '0', amount_spent: '3173' });
    expect(s).toMatchObject({ saldo: null, fonte: 'sem_limite' });
  });

  it('pré-pago sem permissão: saldo nulo, fonte diz o porquê', () => {
    const s = paraSaldo({ ...conta, is_prepay_account: true, spend_cap: '200000' }, { erro: '(#10) Permission Denied.' });
    expect(s).toMatchObject({ saldo: null, teto: null, tipo_pagamento: 'pre_pago', fonte: 'pre_pago_sem_permissao' });
  });

  it('pré-pago com permissão: crédito lido do texto, ignora o teto', () => {
    const s = paraSaldo({ ...conta, is_prepay_account: true, spend_cap: '200000' }, { display_string: 'Saldo disponível (R$ 1.234,56 BRL)' });
    expect(s).toMatchObject({ saldo: 1234.56, teto: null, fonte: 'credito_pre_pago' });
  });

  it('pré-pago com texto que não reconhece: nulo, não inventa', () => {
    const s = paraSaldo({ ...conta, is_prepay_account: true }, { display_string: 'Boleto bancário' });
    expect(s).toMatchObject({ saldo: null, fonte: 'pre_pago_texto_desconhecido' });
  });
});

describe('saldoDoTexto', () => {
  it.each([
    ['Saldo disponível (R$ 1.234,56 BRL)', 1234.56],
    ['Available balance (R$320.00 BRL)', 320],
    ['R$ 50', 50],
  ])('%s → %s', (texto, v) => expect(saldoDoTexto(texto)).toBe(v));
  it('sem R$: nulo', () => expect(saldoDoTexto('Visa *1234')).toBeNull());
});
