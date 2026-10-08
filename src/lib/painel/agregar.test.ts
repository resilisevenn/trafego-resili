import { describe, expect, it } from 'vitest';
import { periodoAnterior, porCampanha, resolverPeriodo, seriePorDia, totais, variacao, type LinhaMetrica } from './agregar';

const l = (o: Partial<LinhaMetrica>): LinhaMetrica => ({
  campanha_id: 'a', data: '2026-10-01', investimento: 0, impressoes: 0, alcance: null,
  cliques: 0, leads: null, conversas: null, ...o,
});

describe('resolverPeriodo', () => {
  const hoje = '2026-10-08';
  it('7d por padrão, terminando ontem', () => {
    expect(resolverPeriodo(undefined, hoje)).toEqual({ chave: '7d', de: '2026-10-01', ate: '2026-10-07' });
  });
  it('30d', () => {
    expect(resolverPeriodo('30d', hoje)).toMatchObject({ de: '2026-09-08', ate: '2026-10-07' });
  });
  it('mês atual vai até hoje', () => {
    expect(resolverPeriodo('mes', hoje)).toMatchObject({ de: '2026-10-01', ate: '2026-10-08' });
  });
  it('personalizado inválido cai no padrão', () => {
    expect(resolverPeriodo('custom', hoje, '2026-10-05', '2026-10-01').chave).toBe('7d');
    expect(resolverPeriodo('custom', hoje, "2026-10-01' or 1=1", '2026-10-02').chave).toBe('7d');
  });
});

describe('periodoAnterior', () => {
  it('mesmo tamanho, imediatamente antes (atravessa mês)', () => {
    expect(periodoAnterior({ de: '2026-10-01', ate: '2026-10-07' })).toEqual({ de: '2026-09-24', ate: '2026-09-30' });
  });
});

describe('totais', () => {
  it('taxas recalculadas dos totais, não média das taxas diárias', () => {
    const t = totais([
      l({ investimento: 10, impressoes: 10, cliques: 5 }),
      l({ investimento: 90, impressoes: 9990, cliques: 5 }),
    ]);
    expect(t.ctr).toBeCloseTo(0.1); // 10 / 10000, e não (50% + 0,05%) / 2
    expect(t.cpc).toBe(10);
    expect(t.cpm).toBe(10);
  });

  it('leads e alcance nulos quando nenhuma linha informa (Google)', () => {
    const t = totais([l({ investimento: 5, impressoes: 100 })]);
    expect(t.alcance).toBeNull();
    expect(t.frequencia).toBeNull();
    expect(t.leads).toBeNull();
  });

  it('sem impressões: taxas nulas, não divisão por zero', () => {
    expect(totais([])).toMatchObject({ investimento: 0, ctr: null, cpc: null, cpm: null });
  });
});

describe('variacao', () => {
  it('calcula %', () => expect(variacao(150, 100)).toBe(50));
  it('nula sem base', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(null, 5)).toBeNull();
  });
});

describe('seriePorDia', () => {
  it('soma campanhas no dia e preenche dias vazios com 0', () => {
    const s = seriePorDia(
      [l({ data: '2026-10-01', investimento: 3 }), l({ campanha_id: 'b', data: '2026-10-01', investimento: 4 })],
      { de: '2026-10-01', ate: '2026-10-03' },
      'investimento',
    );
    expect(s).toEqual([
      { data: '2026-10-01', valor: 7 },
      { data: '2026-10-02', valor: 0 },
      { data: '2026-10-03', valor: 0 },
    ]);
  });
});

describe('porCampanha', () => {
  it('agrupa e ordena por investimento', () => {
    const r = porCampanha([l({ campanha_id: 'x', investimento: 1 }), l({ campanha_id: 'y', investimento: 9 })]);
    expect(r.map((c) => c.campanha_id)).toEqual(['y', 'x']);
  });
});
