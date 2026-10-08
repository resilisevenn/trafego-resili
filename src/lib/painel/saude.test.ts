import { describe, expect, it } from 'vitest';
import { diasDoPeriodo, type LinhaMetrica } from './agregar';
import { prioridade, saude, type Contexto } from './saude';

// Hoje = 15/10/2026. Ontem = 14/10. Semana = 08 a 14/10.
const HOJE = '2026-10-15';
const AGORA = new Date('2026-10-15T12:00:00-03:00');

function dias(de: string, ate: string, f: (d: string) => Partial<LinhaMetrica>): LinhaMetrica[] {
  return diasDoPeriodo({ de, ate }).map((data) => ({
    campanha_id: 'c', data, investimento: 0, impressoes: 0, alcance: null, cliques: 0,
    leads: null, conversas: null, ...f(data),
  }));
}

const base = (o: Partial<Contexto>): Contexto => ({
  hoje: HOJE, plataforma: 'meta', linhas: [], saldo: null, limiteAlerta: null,
  verbaMensal: null, cplMeta: null, ultimaColeta: { inicio: AGORA.toISOString(), status: 'ok' }, agora: AGORA, ...o,
});
const tipos = (c: Contexto) => saude(c).alertas.map((a) => `${a.nivel}:${a.tipo}`);

describe('dias de saldo', () => {
  const linhas = dias('2026-09-01', '2026-10-14', () => ({ investimento: 100 }));
  it('saldo ÷ média dos últimos 7 dias', () => {
    expect(saude(base({ linhas, saldo: 550 })).diasDeSaldo).toBeCloseTo(5.5);
  });
  it('menos de 3 dias: crítico; menos de 7: atenção', () => {
    expect(tipos(base({ linhas, saldo: 250 }))).toContain('critico:saldo');
    expect(tipos(base({ linhas, saldo: 550 }))).toContain('atencao:saldo');
    expect(tipos(base({ linhas, saldo: 5000 }))).not.toContain('atencao:saldo');
  });
  it('sem gasto recente: não projeta', () => {
    expect(saude(base({ linhas: [], saldo: 100 })).diasDeSaldo).toBeNull();
  });
  it('abaixo do limite de alerta vence a projeção', () => {
    expect(tipos(base({ linhas, saldo: 5000, limiteAlerta: 6000 }))).toContain('critico:saldo');
  });
});

describe('conta parou', () => {
  it('gasto zero ontem numa conta que gastava', () => {
    const linhas = dias('2026-10-01', '2026-10-13', () => ({ investimento: 50 }));
    expect(tipos(base({ linhas }))).toContain('critico:parou');
  });
  it('conta que já não gastava não alerta', () => {
    expect(tipos(base({ linhas: [] }))).not.toContain('critico:parou');
  });
});

describe('CPL', () => {
  it('30% acima das 4 semanas anteriores', () => {
    const linhas = dias('2026-09-10', '2026-10-14', (d) => ({
      investimento: 100, leads: d >= '2026-10-08' ? 2 : 4, // CPL 50 × 25
    }));
    expect(tipos(base({ linhas }))).toContain('atencao:cpl');
  });
  it('poucos leads: não compara', () => {
    const linhas = dias('2026-10-08', '2026-10-14', (d) => ({ investimento: 100, leads: d === '2026-10-08' ? 1 : 0 }));
    expect(tipos(base({ linhas }))).not.toContain('atencao:cpl');
  });
  it('acima da meta', () => {
    const linhas = dias('2026-10-08', '2026-10-14', () => ({ investimento: 100, leads: 1 }));
    expect(tipos(base({ linhas, cplMeta: 80 }))).toContain('atencao:meta_cpl');
    expect(tipos(base({ linhas, cplMeta: 120 }))).not.toContain('atencao:meta_cpl');
  });
});

describe('fadiga', () => {
  it('frequência acima de 3 só na Meta', () => {
    const linhas = dias('2026-10-08', '2026-10-14', () => ({ investimento: 10, impressoes: 400, alcance: 100 }));
    expect(tipos(base({ linhas }))).toContain('atencao:fadiga');
    expect(tipos(base({ linhas, plataforma: 'google' }))).not.toContain('atencao:fadiga');
  });
});

describe('ritmo da verba', () => {
  // 14 dias a R$ 100 → projeção 31 × 100 = R$ 3.100.
  const linhas = dias('2026-10-01', '2026-10-14', () => ({ investimento: 100 }));
  it('projeta pelo ritmo até ontem', () => {
    expect(saude(base({ linhas, verbaMensal: 3100 })).mes.projecao).toBeCloseTo(3100);
  });
  it('acima e abaixo da verba', () => {
    expect(tipos(base({ linhas, verbaMensal: 2500 }))).toContain('atencao:ritmo');
    expect(tipos(base({ linhas, verbaMensal: 5000 }))).toContain('atencao:ritmo');
    expect(tipos(base({ linhas, verbaMensal: 3000 }))).not.toContain('atencao:ritmo');
  });
  it('sem verba definida: sem alerta', () => {
    expect(saude(base({ linhas })).mes.percentual).toBeNull();
  });
});

describe('coleta', () => {
  it('erro ou atraso', () => {
    expect(tipos(base({ ultimaColeta: { inicio: AGORA.toISOString(), status: 'erro' } }))).toContain('atencao:coleta');
    expect(tipos(base({ ultimaColeta: { inicio: '2026-10-14T06:00:00-03:00', status: 'ok' } }))).toContain('atencao:coleta');
    expect(tipos(base({}))).not.toContain('atencao:coleta');
  });
});

describe('prioridade', () => {
  it('crítico pesa mais que vários de atenção', () => {
    const critico = saude(base({ linhas: dias('2026-10-01', '2026-10-14', () => ({ investimento: 100 })), saldo: 100 }));
    const atencao = saude(base({ ultimaColeta: { inicio: AGORA.toISOString(), status: 'erro' } }));
    expect(prioridade(critico)).toBeGreaterThan(prioridade(atencao));
  });
});
