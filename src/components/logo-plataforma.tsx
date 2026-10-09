// Logo da plataforma (Meta / Google Ads), dos ícones oficiais do pacote
// simple-icons (licença CC0). Cor da marca por padrão; `cor` sobrescreve
// (ex.: 'currentColor' em botão ativo, onde o azul da marca sumiria no fundo azul).

import { siGoogleads, siMeta } from 'simple-icons';

const ICONES = { meta: siMeta, google: siGoogleads } as const;

export function LogoPlataforma({ plataforma, tamanho = 16, cor }: {
  plataforma: keyof typeof ICONES;
  tamanho?: number;
  cor?: string;
}) {
  const i = ICONES[plataforma];
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" className="shrink-0">
      <path d={i.path} fill={cor ?? `#${i.hex}`} />
    </svg>
  );
}
