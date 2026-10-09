'use client';

import { useActionState } from 'react';
import { trocarSenha } from '@/app/trocar-senha/acoes';

// pedirAtual: troca voluntária. O servidor confere de novo; isto só mostra o campo.
export function FormTrocarSenha({ pedirAtual }: { pedirAtual: boolean }) {
  const [erro, enviar, pendente] = useActionState(trocarSenha, null);
  return (
    <form action={enviar}>
      {pedirAtual && (
        <div className="mb-3">
          <label className="label" htmlFor="atual">Senha atual</label>
          <input id="atual" name="atual" type="password" className="input" autoComplete="current-password" required />
        </div>
      )}
      <div className="mb-3">
        <label className="label" htmlFor="senha">Nova senha</label>
        <input id="senha" name="senha" type="password" className="input" minLength={8} autoComplete="new-password" required />
      </div>
      <div className="mb-5">
        <label className="label" htmlFor="confirmacao">Repita a nova senha</label>
        <input id="confirmacao" name="confirmacao" type="password" className="input" minLength={8} autoComplete="new-password" required />
      </div>
      {erro && <p className="text-sm text-bad mb-4" role="alert">⚠ {erro}</p>}
      <button className="btn btn-primary w-full" type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar senha'}
      </button>
    </form>
  );
}
