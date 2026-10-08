import { describe, expect, it } from 'vitest';
import { buscarTodas } from './paginar';

describe('buscarTodas', () => {
  it('junta as páginas até a última vir incompleta', async () => {
    const fonte = Array.from({ length: 2500 }, (_, i) => i);
    const chamadas: [number, number][] = [];
    const r = await buscarTodas(async (de, ate) => {
      chamadas.push([de, ate]);
      return { data: fonte.slice(de, ate + 1), error: null };
    });
    expect(r).toHaveLength(2500);
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('exatamente 1000: busca mais uma página (vazia) para ter certeza', async () => {
    const fonte = Array.from({ length: 1000 }, (_, i) => i);
    const r = await buscarTodas(async (de, ate) => ({ data: fonte.slice(de, ate + 1), error: null }));
    expect(r).toHaveLength(1000);
  });

  it('erro em qualquer página interrompe', async () => {
    await expect(buscarTodas(async () => ({ data: null, error: { message: 'falhou' } }))).rejects.toThrow('falhou');
  });
});
