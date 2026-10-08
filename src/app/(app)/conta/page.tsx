// Dashboard: uma conta de anúncio por vez, escolhida no seletor.
//
// Lê SÓ do banco, nunca da API ao vivo (BRIEFING, seção 3). Usa o cliente com a
// sessão do usuário: a RLS do schema trafego garante que o gestor só recebe as
// contas dele, mesmo que alguém edite o ?conta= da URL.

import { createClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabase/paginar';
import { type OpcaoConta } from '@/components/seletor';
import { Aviso, Painel } from '@/components/painel';
import { BotaoAtualizar } from '@/components/botao-atualizar';
import { atualizarClinica } from '../acoes';
import { periodoAnterior, resolverPeriodo, type LinhaMetrica } from '@/lib/painel/agregar';
import { hojeNoFuso } from '@/lib/coleta/datas';

// O botão "Atualizar" coleta a clínica dentro desta requisição.
export const maxDuration = 120;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Dashboard({ searchParams }: Props) {
  const q = await searchParams;
  const supabase = await createClient();
  const db = supabase.schema('trafego');

  const { data: contasRaw, error } = await db
    .from('contas_anuncio')
    .select('id, nome, plataforma, fuso, limite_alerta_saldo, clientes(nome)')
    .eq('ativa', true)
    .order('nome');

  if (error) return <Aviso titulo="Erro ao ler as contas">{error.message}</Aviso>;
  if (!contasRaw?.length) {
    return (
      <Aviso titulo="Nenhuma conta disponível">
        Se você é gestor, peça ao administrador para liberar suas contas. Se é admin, a primeira
        coleta ainda não rodou.
      </Aviso>
    );
  }

  const contas = contasRaw.map((c) => ({
    ...c,
    // O join vem como objeto (FK para um) — o tipo gerado não sabe disso sem os tipos do banco.
    cliente: (c.clientes as unknown as { nome: string } | null)?.nome ?? 'Sem cliente',
  }));
  const conta = contas.find((c) => c.id === q.conta) ?? contas[0];

  // "Máximo" começa no primeiro dia com dado desta conta.
  const { data: primeiro } = q.periodo === 'max'
    ? await db.from('metricas_diarias').select('data').eq('conta_anuncio_id', conta.id).order('data').limit(1).maybeSingle()
    : { data: null };
  const periodo = resolverPeriodo(q.periodo, hojeNoFuso(conta.fuso), q.de, q.ate, primeiro?.data);
  const anterior = periodoAnterior(periodo);
  // Busca do início do anterior (ou do atual) até o fim do atual, numa consulta só.
  const desde = anterior && anterior.de < periodo.de ? anterior.de : periodo.de;

  const [metricasR, campanhasR, saldoR, syncR] = await Promise.all([
    // Paginado: "Este ano"/"Máximo" passam de 1000 linhas (limite do PostgREST).
    buscarTodas((de, ate) => db.from('metricas_diarias')
      .select('campanha_id, data, investimento, impressoes, alcance, cliques, leads, conversas, parcela_impressoes')
      .eq('conta_anuncio_id', conta.id)
      .gte('data', desde)
      .lte('data', periodo.ate)
      .order('data').order('campanha_id')
      .range(de, ate)),
    db.from('campanhas').select('campanha_id, nome, status').eq('conta_anuncio_id', conta.id),
    db.from('saldo_conta')
      .select('data, saldo, fonte, coletado_em')
      .eq('conta_anuncio_id', conta.id)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('sync_log')
      .select('inicio, status, erro, linhas')
      .eq('conta_anuncio_id', conta.id)
      .order('inicio', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // numeric chega como string do PostgREST: converte uma vez aqui.
  const linhas: LinhaMetrica[] = metricasR.map((m) => ({
    campanha_id: m.campanha_id,
    data: m.data,
    investimento: Number(m.investimento),
    impressoes: Number(m.impressoes),
    alcance: m.alcance == null ? null : Number(m.alcance),
    cliques: Number(m.cliques),
    leads: m.leads == null ? null : Number(m.leads),
    conversas: m.conversas == null ? null : Number(m.conversas),
    parcela_impressoes: m.parcela_impressoes == null ? null : Number(m.parcela_impressoes),
  }));
  const nomes = new Map((campanhasR.data ?? []).map((c) => [c.campanha_id, c]));

  const opcoes: OpcaoConta[] = contas.map((c) => ({
    id: c.id, nome: c.nome, plataforma: c.plataforma as OpcaoConta['plataforma'], cliente: c.cliente,
  }));

  return (
    <Painel
      opcoes={opcoes}
      contaId={conta.id}
      plataforma={conta.plataforma}
      periodo={periodo}
      anterior={anterior}
      linhas={linhas}
      nomes={nomes}
      saldo={saldoR.data ? { saldo: saldoR.data.saldo == null ? null : Number(saldoR.data.saldo), data: saldoR.data.data, fonte: saldoR.data.fonte } : null}
      limite={conta.limite_alerta_saldo == null ? null : Number(conta.limite_alerta_saldo)}
      sync={syncR.data}
      voltar="/"
      atualizar={<BotaoAtualizar contaId={conta.id} acao={atualizarClinica} />}
    />
  );
}
