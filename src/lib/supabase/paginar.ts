// O PostgREST do Supabase devolve no máximo `max_rows` linhas por consulta
// (1000 neste projeto) e CORTA EM SILÊNCIO o resto. Para somas (investimento
// do ano, visão geral de todas as contas) isso daria totais menores que os reais.
// Esta função busca página por página até acabar.
//
// A consulta precisa de ordem estável (order por colunas únicas juntas), senão
// uma linha pode cair em duas páginas ou em nenhuma.

const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function buscarTodas<T>(consulta: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}
