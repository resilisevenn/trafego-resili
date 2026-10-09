import { describe, expect, it } from 'vitest';
import { hojeNoFuso, janela, semanaFechada } from './datas';

describe('janela', () => {
  it('usa a data do fuso da conta, não a UTC', () => {
    // 02h UTC de 09/10 ainda é 08/10 em São Paulo.
    const agora = new Date('2026-10-09T02:00:00Z');
    expect(hojeNoFuso('America/Sao_Paulo', agora)).toBe('2026-10-08');
    expect(janela('America/Sao_Paulo', agora)).toEqual({ since: '2026-10-01', until: '2026-10-08' });
  });
});

describe('semanaFechada', () => {
  it('são os 7 dias antes de hoje, no fuso da conta', () => {
    // Segunda 12/10 às 06h de Brasília: a semana do relatório, 05 a 11/10.
    const agora = new Date('2026-10-12T09:00:00Z');
    expect(semanaFechada('America/Sao_Paulo', agora)).toEqual({ since: '2026-10-05', until: '2026-10-11' });
  });
});
