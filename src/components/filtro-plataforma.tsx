// Botões "Meta Ads" / "Google Ads" que filtram uma seção por plataforma.
// O filtro fica na URL (`?<parametro>=meta|google`), então continua aplicado
// depois de salvar ou recarregar. Cada seção usa um parâmetro próprio, para um
// filtro não mexer no outro; os demais parâmetros da URL são preservados.
// Clicar no filtro ativo desliga (volta a mostrar todas).

import Link from 'next/link';
import { LogoPlataforma } from '@/components/logo-plataforma';

export type Plataforma = 'meta' | 'google';

export function lerFiltro(valor: string | undefined): Plataforma | null {
  return valor === 'meta' || valor === 'google' ? valor : null;
}

export function FiltroPlataforma({ caminho, parametro, atual, params }: {
  caminho: string;
  parametro: string;
  atual: Plataforma | null;
  params: Record<string, string | undefined>; // a URL atual, para preservar os outros filtros
}) {
  const href = (valor: Plataforma | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== parametro) q.set(k, v);
    if (valor) q.set(parametro, valor);
    const s = q.toString();
    return s ? `${caminho}?${s}` : caminho;
  };

  return (
    <div className="flex gap-1" role="group" aria-label="Filtrar por plataforma">
      {(['meta', 'google'] as const).map((pl) => {
        const ativo = atual === pl;
        return (
          <Link
            key={pl}
            href={href(ativo ? null : pl)}
            aria-pressed={ativo}
            className={`btn inline-flex items-center gap-2 ${ativo ? 'btn-primary' : ''}`}
            scroll={false}
          >
            <LogoPlataforma plataforma={pl} cor={ativo ? 'currentColor' : undefined} />
            {pl === 'meta' ? 'Meta Ads' : 'Google Ads'}
          </Link>
        );
      })}
    </div>
  );
}
