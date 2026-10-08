import { describe, expect, it } from 'vitest';
import { fmtMoeda, lerReais } from './formato';

describe('lerReais', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1500.50', 1500.5], // o caso que virava 150.050
    ['1500.5', 1500.5],
    ['1.500', 1500],
    ['1.500.000', 1500000],
    ['1500', 1500],
    ['R$ 2.000,00', 2000],
    ['  300 ', 300],
  ])('%s → %s', (texto, esperado) => expect(lerReais(texto)).toBe(esperado));

  it('vazio é nulo', () => expect(lerReais('   ')).toBeNull());
  it('lixo é NaN', () => {
    expect(lerReais('abc')).toBeNaN();
    expect(lerReais('-50')).toBeNaN();
    expect(lerReais('1,2,3')).toBeNaN();
  });
});

describe('fmtMoeda', () => {
  it('padrão brasileiro e "—" para nulo', () => {
    expect(fmtMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(fmtMoeda(null)).toBe('—');
  });
});
