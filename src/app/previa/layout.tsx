// Moldura da prévia local: a faixa de aviso + o MESMO cabeçalho do sistema,
// para navegar entre as telas como o usuário vai navegar.

import { Cabecalho } from '@/components/cabecalho';

export default function PreviaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-[var(--warn)] text-black text-xs text-center py-1 font-medium">
        PRÉVIA LOCAL · dados fictícios · não é o banco
      </div>
      <Cabecalho
        base="/previa"
        email="gestor@exemplo.com"
        admin={false}
        sair={<span className="text-sm text-faint" title="Na prévia não há sessão">Sair</span>}
      />
      <main className="flex-1 mx-auto w-full max-w-[1200px] px-5 py-8">{children}</main>
    </>
  );
}
