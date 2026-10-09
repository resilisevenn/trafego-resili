'use client';

// Cabeçalho único do sistema, usado pelo app real e pela prévia local (que só
// troca o prefixo das rotas). O link da página atual fica destacado.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Cabecalho({ base = '', email, admin, sair }: {
  base?: string; // '' no sistema, '/previa' na prévia
  email: string;
  admin: boolean;
  sair: React.ReactNode;
}) {
  const atual = usePathname();
  const inicio = base || '/';
  const links = [
    { href: inicio, rotulo: 'Visão geral' },
    { href: `${base}/conta`, rotulo: 'Por conta' },
    ...(admin ? [{ href: `${base}/config`, rotulo: 'Configuração' }, { href: `${base}/admin`, rotulo: 'Admin' }] : []),
  ];

  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-5 h-14 flex items-center gap-6">
        <Link href={inicio} className="flex items-center gap-2 shrink-0" aria-label="Tráfego — Resili Sevenn">
          <Image src="/logo-resili-sevenn.png" alt="Resili Sevenn" width={192} height={20} className="h-5 w-auto" priority />
          <span className="font-display text-lg text-accent-light leading-none">Tráfego</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const ativo = atual === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={ativo ? 'page' : undefined}
                className={`text-sm px-3 py-1.5 rounded-md ${ativo ? 'bg-[var(--surface-2)] text-foreground' : 'text-muted hover:text-foreground'}`}
              >
                {l.rotulo}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted">{email}</span>
          {/* A prévia local não tem a troca de senha. */}
          {!base && <Link href="/trocar-senha" className="text-sm text-faint hover:text-foreground">Minha senha</Link>}
          {sair}
        </div>
      </div>
    </header>
  );
}
