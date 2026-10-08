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
  ['conversas', 'Conversas'],
] as const;
