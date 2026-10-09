// Métricas que podem entrar no relatório de segunda. As chaves batem com as
// colunas de metricas_diarias e com o que trafego.relatorio_semanal() entende.
export const METRICAS_RELATORIO = [
  ['investimento', 'Investimento'],
  ['impressoes', 'Impressões'],
  ['alcance', 'Alcance'],
  ['frequencia', 'Frequência'],
  ['cliques', 'Cliques'],
  ['ctr', 'CTR'],
  ['cpc', 'CPC'],
  ['cpm', 'CPM'],
  ['leads', 'Leads'],
  ['cpl', 'Custo por lead'],
  ['conversas', 'Conversas'],
  ['custo_conversa', 'Custo por conversa'],
  ['taxa_conv', 'Taxa de conversão'],
  ['parcela_impressoes', 'Parcela de impressões'],
  ['resultado', 'Resultado'],
  ['custo_resultado', 'Custo por resultado'],
] as const;

// O que cada plataforma não tem: o Google não expõe alcance, frequência nem
// conversas por campanha; taxa de conversão e parcela de impressões são de
// campanha de pesquisa do Google. Fora daqui, a métrica nem aparece para marcar.
const FORA: Record<string, readonly string[]> = {
  google: ['alcance', 'frequencia', 'conversas', 'custo_conversa', 'resultado', 'custo_resultado'],
  meta: ['taxa_conv', 'parcela_impressoes'],
};

export const metricasDa = (plataforma: string) =>
  METRICAS_RELATORIO.filter(([chave]) => !FORA[plataforma]?.includes(chave));
