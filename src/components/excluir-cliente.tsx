'use client';

// "excluir" de um cliente desativado, com confirmação. As contas ligadas a ele
// voltam para "Sem cliente" (FK on delete set null); métricas não são apagadas.
export function ExcluirCliente({ id, nome, contasLigadas, acao }: {
  id: string;
  nome: string;
  contasLigadas: number;
  acao: (form: FormData) => Promise<void>;
}) {
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        const aviso = contasLigadas
          ? `\n\n${contasLigadas} conta(s) ligada(s) a ele voltam para "Sem cliente". Os números das contas não são apagados.`
          : '';
        if (!confirm(`Excluir o cliente "${nome}"?${aviso}\n\nNão dá para desfazer.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-bad hover:underline" type="submit">excluir</button>
    </form>
  );
}
