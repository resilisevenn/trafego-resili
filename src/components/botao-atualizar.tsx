'use client';

import { useState, useTransition } from 'react';

// Recebe a ação por prop: no dashboard é a server action real; na prévia local,
// uma de mentira, para o botão aparecer sem tocar em nenhuma plataforma.
export function BotaoAtualizar({ contaId, acao }: {
  contaId: string;
  acao: (contaId: string) => Promise<{ ok: boolean; mensagem: string }>;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);

  return (
    <div className="flex items-center gap-3">
      {aviso && (
        <span className={`text-xs ${aviso.ok ? 'text-muted' : 'text-bad'}`} role="status">
          {aviso.ok ? '✓' : '⚠'} {aviso.mensagem}
        </span>
      )}
      <button
        type="button"
        className="btn"
        disabled={pendente}
        onClick={() => iniciar(async () => setAviso(await acao(contaId)))}
      >
        {pendente ? 'Atualizando…' : '↻ Atualizar'}
      </button>
    </div>
  );
}
