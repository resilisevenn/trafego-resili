import { describe, expect, it } from 'vitest';
import { hojeNoFuso, janela } from './datas';

describe('janela', () => {
  it('usa a data do fuso da conta, não a UTC', () => {
    // 02h UTC de 09/10 ainda é 08/10 em São Paulo.
    const agora = new Date('2026-10-09T02:00:00Z');
    expect(hojeNoFuso('America/Sao_Paulo', agora)).toBe('2026-10-08');
    expect(janela('America/Sao_Paulo', agora)).toEqual({ since: '2026-10-01', until: '2026-10-08' });
  });
});
