// "Saúde" de uma conta: dias de saldo, ritmo da verba e alertas.
// Puro, sem banco: a página entrega as linhas e o contexto, aqui só se calcula.
//
// Os limites ficam em LIMITES, num lugar só. São o ponto de partida combinado
// em 08/10/2026; ajustar aqui muda o painel inteiro.

import { diasDoPeriodo, totais, type LinhaMetrica } from './agregar';

export const LIMITES = {
  // Saldo: o aviso de cada conta vem de contas_anuncio.alerta_saldo_dias (padrão
  // 3). Abaixo dele é crítico; até o dobro dele, atenção (antecedência).
  saldoDiasPadrao: 3,
  // "Parou": gasto zero ontem numa conta que gastava pelo menos isto por dia.
  gastoMinimoParaParada: 5,
  // CPL dos últimos 7 dias acima de (1 + x) × CPL das 4 semanas anteriores.
  cplAlta: 0.3,
  leadsMinimosParaCpl: 3,
  frequenciaFadiga: 3,
  // Projeção do mês contra a verba combinada.
  ritmoAcima: 0.1,
  ritmoAbaixo: 0.2,
  coletaHorasMax: 26,
} as const;

export type Nivel = 'critico' | 'atencao';
export type Alerta = { nivel: Nivel; tipo: string; texto: string };

const dia = (s: string) => new Date(`${s}T12:00:00Z`);
function somaDias(s: string, n: number) {
  const d = dia(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const entre = (ls: LinhaMetrica[], de: string, ate: string) => ls.filter((l) => l.data >= de && l.data <= ate);
const gasto = (ls: LinhaMetrica[]) => ls.reduce((s, l) => s + Number(l.investimento), 0);

export type Contexto = {
  hoje: string; // no fuso da conta
  plataforma: string;
  linhas: LinhaMetrica[]; // pelo menos os últimos 35 dias e o mês corrente
  saldo: number | null;
  // De onde veio o saldo (saldo_conta.fonte): distingue boleto, teto de gastos,
  // conta sem teto e boleto sem permissão de leitura.
  fonteSaldo: string | null;
  alertaDias: number | null;
  verbaMensal: number | null;
  cplMeta: number | null;
  ultimaColeta: { inicio: string; status: string } | null;
  agora?: Date;
};

export type Saude = {
  semana: ReturnType<typeof totais>; // últimos 7 dias fechados (até ontem)
  semanaAnterior: ReturnType<typeof totais>;
  mediaDiaria: number; // gasto médio dos últimos 7 dias
  diasDeSaldo: number | null;
  mes: { gasto: number; projecao: number; verba: number | null; percentual: number | null };
  alertas: Alerta[];
};

export function saude(c: Contexto): Saude {
  const ontem = somaDias(c.hoje, -1);
  const ini7 = somaDias(ontem, -6);
  const semana = entre(c.linhas, ini7, ontem);
  const semanaAnterior = entre(c.linhas, somaDias(ini7, -7), somaDias(ini7, -1));
  const quatroAntes = entre(c.linhas, somaDias(ini7, -28), somaDias(ini7, -1));

  const tSemana = totais(semana);
  const mediaDiaria = gasto(semana) / 7;
  // Saldo ÷ ritmo atual. Sem gasto recente, não há como projetar.
  const diasDeSaldo = c.saldo != null && mediaDiaria > 0 ? c.saldo / mediaDiaria : null;

  // Ritmo do mês: projeta pelo ritmo até ontem (hoje ainda está acumulando).
  const iniMes = `${c.hoje.slice(0, 8)}01`;
  const diasNoMes = diasDoPeriodo({ de: iniMes, ate: ultimoDia(c.hoje) }).length;
  const diasPassados = Math.max(Number(ontem.slice(8)), 0);
  const gastoMes = gasto(entre(c.linhas, iniMes, c.hoje));
  const gastoAteOntem = c.hoje.slice(8) === '01' ? 0 : gasto(entre(c.linhas, iniMes, ontem));
  const projecao = diasPassados && c.hoje.slice(8) !== '01' ? (gastoAteOntem / diasPassados) * diasNoMes : gastoMes;

  const alertas: Alerta[] = [];
  const add = (nivel: Nivel, tipo: string, texto: string) => alertas.push({ nivel, tipo, texto });

  // Saldo, por DIAS (decisão de 09/10/2026): saldo ÷ gasto médio dos últimos 7 dias.
  const aviso = c.alertaDias ?? LIMITES.saldoDiasPadrao;
  const boleto = c.fonteSaldo === 'credito_pre_pago';
  const oQue = boleto ? 'Crédito do boleto/Pix acaba' : 'Chega no teto de gastos';
  if (c.fonteSaldo === 'pre_pago_sem_permissao' || c.fonteSaldo === 'pre_pago_texto_desconhecido') {
    add('atencao', 'saldo', 'Conta de boleto/Pix: não foi possível ler o crédito (permissão na Meta)');
  } else if (diasDeSaldo != null && diasDeSaldo < aviso) {
    add('critico', 'saldo', `${oQue} em ~${Math.max(Math.floor(diasDeSaldo), 0)} dia(s)`);
  } else if (diasDeSaldo != null && diasDeSaldo < aviso * 2) {
    add('atencao', 'saldo', `${oQue} em ~${Math.floor(diasDeSaldo)} dias`);
  }

  // Parou: média dos 7 dias ANTES de ontem, para ontem zerado não puxar a média.
  const mediaAntesDeOntem = gasto(entre(c.linhas, somaDias(ontem, -7), somaDias(ontem, -1))) / 7;
  if (gasto(entre(c.linhas, ontem, ontem)) === 0 && mediaAntesDeOntem >= LIMITES.gastoMinimoParaParada) {
    add('critico', 'parou', 'Sem gasto ontem: campanha pausada, pagamento ou reprovação?');
  }

  // CPL
  const cplSemana = tSemana.leads != null && tSemana.leads >= LIMITES.leadsMinimosParaCpl ? tSemana.cpl : null;
  const t4 = totais(quatroAntes);
  const cplBase = t4.leads != null && t4.leads >= LIMITES.leadsMinimosParaCpl ? t4.cpl : null;
  const rotuloCpl = c.plataforma === 'google' ? 'Custo por conversão' : 'CPL';
  if (cplSemana != null && cplBase != null && cplSemana > cplBase * (1 + LIMITES.cplAlta)) {
    add('atencao', 'cpl', `${rotuloCpl} ${Math.round((cplSemana / cplBase - 1) * 100)}% acima das 4 semanas anteriores`);
  }
  if (cplSemana != null && c.cplMeta != null && cplSemana > c.cplMeta) {
    add('atencao', 'meta_cpl', `${rotuloCpl} acima da meta`);
  }

  // Fadiga (só Meta). A frequência aqui é aproximada para baixo (alcance somado
  // por dia): se já passa do limite, a real passa mais ainda.
  if (c.plataforma === 'meta' && tSemana.frequencia != null && tSemana.frequencia > LIMITES.frequenciaFadiga) {
    add('atencao', 'fadiga', `Frequência ${tSemana.frequencia.toFixed(1).replace('.', ',')} na semana: criativo cansando?`);
  }

  // Ritmo da verba
  const percentual = c.verbaMensal ? projecao / c.verbaMensal : null;
  if (percentual != null && percentual > 1 + LIMITES.ritmoAcima) {
    add('atencao', 'ritmo', `No ritmo atual, o mês fecha ${Math.round((percentual - 1) * 100)}% acima da verba`);
  } else if (percentual != null && percentual < 1 - LIMITES.ritmoAbaixo) {
    add('atencao', 'ritmo', `No ritmo atual, sobram ${Math.round((1 - percentual) * 100)}% da verba`);
  }

  // Coleta
  const agora = c.agora ?? new Date();
  if (!c.ultimaColeta) {
    add('atencao', 'coleta', 'Sem coleta nos últimos 3 dias');
  } else if (c.ultimaColeta.status === 'erro') {
    add('atencao', 'coleta', 'Última coleta com erro: os números podem estar parados');
  } else if (agora.getTime() - new Date(c.ultimaColeta.inicio).getTime() > LIMITES.coletaHorasMax * 3600e3) {
    add('atencao', 'coleta', 'Coleta atrasada (mais de 26 h)');
  }

  alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1));

  return {
    semana: tSemana,
    semanaAnterior: totais(semanaAnterior),
    mediaDiaria,
    diasDeSaldo,
    mes: { gasto: gastoMes, projecao, verba: c.verbaMensal, percentual },
    alertas,
  };
}

function ultimoDia(hoje: string) {
  const [a, m] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0, 12)).toISOString().slice(0, 10);
}

// Ordem da visão geral: quem precisa de ação primeiro.
export function prioridade(s: Saude) {
  const criticos = s.alertas.filter((a) => a.nivel === 'critico').length;
  return criticos * 100 + s.alertas.length;
}
