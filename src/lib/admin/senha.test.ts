import { describe, expect, it } from 'vitest';
import { gerarSenhaProvisoria, validarSenhaNova } from './senha';

describe('gerarSenhaProvisoria', () => {
  it('3 blocos de 4, sem caracteres que se confundem', () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(s).not.toMatch(/[01ilo]/);
    }
  });
  it('não se repete', () => {
    const vistas = new Set(Array.from({ length: 200 }, gerarSenhaProvisoria));
    expect(vistas.size).toBe(200);
  });
});

describe('validarSenhaNova', () => {
  it('exige 8 caracteres e confirmação igual', () => {
    expect(validarSenhaNova('curta', 'curta')).toMatch(/8 caracteres/);
    expect(validarSenhaNova('senhaboa1', 'senhaboa2')).toMatch(/não são iguais/);
    expect(validarSenhaNova('senhaboa1', 'senhaboa1')).toBeNull();
  });
});
