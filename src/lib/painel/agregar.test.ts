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

describe('períodos de calendário (hoje = quinta, 08/10/2026)', () => {
  const hoje = '2026-10-08';
  const r = (chave: string, inicio?: string) => resolverPeriodo(chave, hoje, undefined, undefined, inicio);

  it('hoje', () => expect(r('hoje')).toMatchObject({ de: '2026-10-08', ate: '2026-10-08' }));
  it('esta semana começa na segunda', () => expect(r('semana')).toMatchObject({ de: '2026-10-05', ate: '2026-10-08' }));
  it('semana anterior: segunda a domingo', () => expect(r('semana_anterior')).toMatchObject({ de: '2026-09-28', ate: '2026-10-04' }));
  it('domingo ainda é da semana que começou na segunda', () => {
    expect(resolverPeriodo('semana', '2026-10-11')).toMatchObject({ de: '2026-10-05', ate: '2026-10-11' });
  });
  it('último mês = mês passado inteiro', () => expect(r('mes_anterior')).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' }));
  it('este ano', () => expect(r('ano')).toMatchObject({ de: '2026-01-01', ate: '2026-10-08' }));
  it('máximo começa no primeiro dado', () => expect(r('max', '2025-02-08')).toMatchObject({ de: '2025-02-08', ate: '2026-10-08' }));
  it('máximo sem dado nenhum: só hoje', () => expect(r('max')).toMatchObject({ de: '2026-10-08', ate: '2026-10-08' }));
});

describe('periodoAnterior', () => {
  it('últimos N dias: mesmo tamanho, imediatamente antes (atravessa mês)', () => {
    expect(periodoAnterior({ de: '2026-10-01', ate: '2026-10-07' })).toEqual({ de: '2026-09-24', ate: '2026-09-30' });
  });
  it('hoje × ontem', () => {
    expect(periodoAnterior({ chave: 'hoje', de: '2026-10-08', ate: '2026-10-08' })).toEqual({ de: '2026-10-07', ate: '2026-10-07' });
  });
  it('esta semana até quinta × semana passada até quinta', () => {
    expect(periodoAnterior({ chave: 'semana', de: '2026-10-05', ate: '2026-10-08' })).toEqual({ de: '2026-09-28', ate: '2026-10-01' });
  });
  it('este mês até dia 8 × mesmo trecho do mês passado', () => {
    expect(periodoAnterior({ chave: 'mes', de: '2026-10-01', ate: '2026-10-08' })).toEqual({ de: '2026-09-01', ate: '2026-09-08' });
  });
  it('dia 31 × mês anterior de 30 dias corta no dia 30', () => {
    expect(periodoAnterior({ chave: 'mes', de: '2026-10-01', ate: '2026-10-31' })).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
  });
  it('último mês × o mês antes dele', () => {
    expect(periodoAnterior({ chave: 'mes_anterior', de: '2026-09-01', ate: '2026-09-30' })).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
  });
  it('janeiro × dezembro do ano anterior', () => {
    expect(periodoAnterior({ chave: 'mes_anterior', de: '2026-01-01', ate: '2026-01-31' })).toEqual({ de: '2025-12-01', ate: '2025-12-31' });
  });
  it('este ano × mesmo trecho do ano passado', () => {
    expect(periodoAnterior({ chave: 'ano', de: '2026-01-01', ate: '2026-10-08' })).toEqual({ de: '2025-01-01', ate: '2025-10-08' });
  });
  it('máximo não tem comparação', () => {
    expect(periodoAnterior({ chave: 'max', de: '2025-01-01', ate: '2026-10-08' })).toBeNull();
  });
});

describe('custo por lead', () => {
  it('investimento ÷ leads; nulo sem leads', () => {
    expect(totais([l({ investimento: 100, leads: 4 })]).cpl).toBe(25);
    expect(totais([l({ investimento: 100, leads: 0 })]).cpl).toBeNull();
    expect(totais([l({ investimento: 100 })]).cpl).toBeNull();
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

describe('métricas do Google', () => {
  it('taxa de conversão = conversões ÷ cliques', () => {
    expect(totais([l({ cliques: 40, leads: 2 })]).taxa_conversao).toBe(5);
    expect(totais([l({ cliques: 40 })]).taxa_conversao).toBeNull();
  });

  it('parcela de impressões ponderada pelas impressões, não média simples', () => {
    // Dia 1: 2 de 2 possíveis (100%). Dia 2: 200 de 800 possíveis (25%).
    // Total: 202 de 802 ≈ 25,2%. A média simples daria 62,5%.
    const t = totais([
      l({ data: '2026-10-01', impressoes: 2, parcela_impressoes: 1 }),
      l({ data: '2026-10-02', impressoes: 200, parcela_impressoes: 0.25 }),
    ]);
    expect(t.parcela_impressoes).toBeCloseTo(25.19, 2);
  });

  it('parcela nula na Meta e em campanha que não é de pesquisa', () => {
    expect(totais([l({ impressoes: 100 })]).parcela_impressoes).toBeNull();
  });
});
