'use client';

import { useState } from 'react';

// Senha provisória em destaque: um clique copia para a área de transferência.
export function SenhaCopiavel({ senha }: { senha: string }) {
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title="Clique para copiar"
      className="inline-flex items-center gap-3 rounded-md border border-ok/40 bg-ok/10 px-3 py-1.5 font-mono text-lg text-ok select-all hover:bg-ok/20"
    >
      {senha}
      <span className="font-sans text-xs">{copiada ? '✓ Copiada' : 'Copiar'}</span>
    </button>
  );
}
