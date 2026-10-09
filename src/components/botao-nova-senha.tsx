'use client';

import { useState, useTransition } from 'react';
import { SenhaCopiavel } from '@/components/senha-copiavel';

// "Gerar nova senha provisória" do /admin: mostra a senha nova em destaque,
// copiável, como no "Novo gestor".
export function BotaoNovaSenha({ acao }: {
  acao: () => Promise<{ ok: boolean; mensagem: string }>;
}) {
  const [pendente, iniciar] = useTransition();
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {res && !res.ok && <span className="text-xs text-bad" role="alert">⚠ {res.mensagem}</span>}
      {res?.ok && (
        <span className="flex items-center gap-2 text-xs text-muted" role="status">
          Envie ao gestor: <SenhaCopiavel senha={res.mensagem} />
        </span>
      )}
      <button type="button" className="btn" disabled={pendente} onClick={() => iniciar(async () => setRes(await acao()))}>
        {pendente ? 'Gerando…' : 'Gerar nova senha provisória'}
      </button>
    </div>
  );
}
