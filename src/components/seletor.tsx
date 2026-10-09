'use client';

// Filtros numa linha só, acima de tudo: cliente → plataforma → conta, e período.
// O estado vive na URL (?conta=&periodo=&de=&ate=): dá para salvar o link e
// voltar, e a página (server component) relê os dados a cada troca.

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PERIODOS } from '@/lib/painel/agregar';
import { LogoPlataforma } from '@/components/logo-plataforma';

export type OpcaoConta = {
  id: string;
  nome: string;
  plataforma: 'meta' | 'google';
  cliente: string; // "Sem cliente" quando ainda não foi ligada
};

const PLATAFORMAS = { meta: 'Meta Ads', google: 'Google Ads' } as const;

export function Seletor({ contas, contaId, periodo, de, ate }: {
  contas: OpcaoConta[];
  contaId: string;
  periodo: string;
  de: string;
  ate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const atual = contas.find((c) => c.id === contaId);
  const clientes = [...new Set(contas.map((c) => c.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const doCliente = contas.filter((c) => c.cliente === atual?.cliente);
  const plataformas = [...new Set(doCliente.map((c) => c.plataforma))];
  const daPlataforma = doCliente.filter((c) => c.plataforma === atual?.plataforma);

  function ir(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${pathname}?${p}`);
  }

  // Trocar cliente ou plataforma leva para a primeira conta que bate.
  const primeira = (f: (c: OpcaoConta) => boolean) => contas.find(f)?.id ?? null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Cliente">
        <select className="input" value={atual?.cliente} onChange={(e) => ir({ conta: primeira((c) => c.cliente === e.target.value) })}>
          {clientes.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Campo>

      {/* Botões com logo em vez de <select>: <option> não aceita imagem. Só as
          plataformas que esta clínica tem. */}
      <div className="flex flex-col gap-1">
        <span className="label">Plataforma</span>
        <div className="flex gap-1" role="group" aria-label="Plataforma">
          {plataformas.map((p) => {
            const ativo = atual?.plataforma === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={ativo}
                className={`btn inline-flex items-center gap-2 ${ativo ? 'btn-primary' : ''}`}
                onClick={() => !ativo && ir({ conta: primeira((c) => c.cliente === atual?.cliente && c.plataforma === p) })}
              >
                <LogoPlataforma plataforma={p} cor={ativo ? 'currentColor' : undefined} />
                {PLATAFORMAS[p]}
              </button>
            );
          })}
        </div>
      </div>

      {daPlataforma.length > 1 && (
        <Campo rotulo="Conta">
          <select className="input" value={contaId} onChange={(e) => ir({ conta: e.target.value })}>
            {daPlataforma.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      )}

      <Campo rotulo="Período">
        <select className="input" value={periodo} onChange={(e) => ir({ periodo: e.target.value, de: null, ate: null })}>
          {PERIODOS.map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
        </select>
      </Campo>

      {periodo === 'custom' && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            ir({ periodo: 'custom', de: String(f.get('de')), ate: String(f.get('ate')) });
          }}
        >
          <Campo rotulo="De"><input className="input" type="date" name="de" defaultValue={de} required /></Campo>
          <Campo rotulo="Até"><input className="input" type="date" name="ate" defaultValue={ate} required /></Campo>
          <button className="btn" type="submit">Aplicar</button>
        </form>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{rotulo}</span>
      {children}
    </label>
  );
}
