'use client';

import { useState, useTransition } from 'react';

// Botão que chama uma server action sem argumentos e mostra o resultado ao lado.
export function BotaoAcao({ rotulo, rotuloPendente, acao }: {
  rotulo: string;
  rotuloPendente: string;
  acao: () => Promise<{ ok: boolean; mensagem: string }>;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {aviso && (
        <span className={`text-xs max-w-xs text-right ${aviso.ok ? 'text-muted' : 'text-bad'}`} role="status">
          {aviso.ok ? '✓' : '⚠'} {aviso.mensagem}
        </span>
      )}
      <button type="button" className="btn btn-primary" disabled={pendente} onClick={() => iniciar(async () => setAviso(await acao()))}>
        {pendente ? rotuloPendente : rotulo}
      </button>
    </div>
  );
}
