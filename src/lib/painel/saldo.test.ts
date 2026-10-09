import { describe, expect, it } from 'vitest';
import { situacaoSaldo } from './saldo';

const n = (s: string) => s.replace(/\s/g, ' ');

describe('situacaoSaldo', () => {
  it('teto de gastos: % usado (números reais da Dra. Gabrielle em 09/10/2026)', () => {
    const s = situacaoSaldo({ fonte: 'spend_cap_menos_gasto', saldo: 900.01, teto: 1200 }, 'meta');
    expect(s).toMatchObject({ tipo: 'teto', rotulo: 'Teto de gastos', alertaAplica: true });
    expect(n(s.detalhe)).toBe('R$ 1.200,00 · 25% usado');
  });

  it('boleto: mostra o crédito', () => {
    const s = situacaoSaldo({ fonte: 'credito_pre_pago', saldo: 320, teto: null }, 'meta');
    expect(s.tipo).toBe('boleto');
    expect(n(s.detalhe)).toBe('crédito R$ 320,00');
  });

  it('boleto sem permissão: diz o porquê, alerta continua aplicável', () => {
    expect(situacaoSaldo({ fonte: 'pre_pago_sem_permissao', saldo: null, teto: null }, 'meta'))
      .toMatchObject({ tipo: 'boleto', detalhe: 'sem permissão para ler o crédito', alertaAplica: true });
  });

  it('cartão sem teto: alerta de saldo não se aplica', () => {
    expect(situacaoSaldo({ fonte: 'sem_limite', saldo: null, teto: null }, 'meta'))
      .toMatchObject({ tipo: 'sem_teto', rotulo: 'Cartão sem teto', alertaAplica: false });
    expect(situacaoSaldo({ fonte: 'sem_limite', saldo: null, teto: null }, 'google').rotulo).toBe('Orçamento sem limite');
  });

  it('orçamento do Google', () => {
    const s = situacaoSaldo({ fonte: 'account_budget', saldo: 872.91, teto: 1600 }, 'google');
    expect(s.rotulo).toBe('Orçamento da conta');
    expect(n(s.detalhe)).toBe('R$ 1.600,00 · 45% usado');
  });

  it('sem coleta ainda', () => {
    expect(situacaoSaldo({ fonte: null, saldo: null, teto: null }, 'meta').tipo).toBe('desconhecido');
  });
});
