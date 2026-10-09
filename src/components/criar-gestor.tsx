'use client';

// Formulário "Novo gestor" do /admin. A senha provisória aparece UMA vez, aqui:
// não fica guardada em lugar nenhum além do Supabase Auth (com hash).

import { useActionState } from 'react';
import { SenhaCopiavel } from '@/components/senha-copiavel';

type Resultado = { ok: boolean; mensagem: string };

export function CriarGestor({ acao }: {
  acao: (anterior: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const [res, enviar, pendente] = useActionState(acao, null);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <form action={enviar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="nome">Nome</label>
          <input id="nome" name="nome" className="input" required autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="off" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pendente}>
          {pendente ? 'Criando…' : 'Criar gestor'}
        </button>
      </form>

      {res && !res.ok && <p className="text-sm text-bad" role="alert">⚠ {res.mensagem}</p>}
      {res?.ok && (
        <div className="text-sm rounded-md border border-border p-3" role="status">
          <p>✓ Gestor criado. Senha provisória (aparece só agora):</p>
          <div className="my-2"><SenhaCopiavel senha={res.mensagem} /></div>
          <p className="text-muted">
            Envie pelo WhatsApp junto com o endereço <span className="font-mono">trafego.resilisevenn.pro</span>.
            No primeiro acesso ele cria a senha dele. Depois, libere as contas na ficha abaixo.
          </p>
        </div>
      )}
    </div>
  );
}
