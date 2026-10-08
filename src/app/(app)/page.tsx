// Visão geral: a página inicial. Todas as contas que o usuário vê (a RLS filtra:
// o gestor só recebe as dele), com dias de saldo, ritmo da verba e alertas.
// Clicar numa linha abre o dashboard da conta (/conta).

import { createClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabase/paginar';
import { Aviso } from '@/components/painel';
import { VisaoGeral, type LinhaGeral } from '@/components/visao-geral';
import { hojeNoFuso } from '@/lib/coleta/datas';
import { prioridade, saude } from '@/lib/painel/saude';
import type { LinhaMetrica } from '@/lib/painel/agregar';

const FUSO_PADRAO = 'America/Sao_Paulo';

function menos(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function VisaoGeralPage() {
  const supabase = await createClient();
  const db = supabase.schema('trafego');

  const { data: contas, error } = await db
    .from('contas_anuncio')
    .select('id, nome, plataforma, fuso, limite_alerta_saldo, verba_mensal, cpl_meta, clientes(nome)')
    .eq('ativa', true);
  if (error) return <Aviso titulo="Erro ao ler as contas">{error.message}</Aviso>;
  if (!contas?.length) {
    return (
      <Aviso titulo="Nenhuma conta disponível">
        Se você é gestor, peça ao administrador para liberar suas contas. Se é admin, a primeira
        coleta ainda não rodou.
      </Aviso>
    );
  }

  // Janela única para todas as contas: 35 dias (4 semanas de base + a semana)
  // ou desde o dia 1º do mês, o que vier antes. Uma consulta, não uma por conta.
  const hoje = hojeNoFuso(FUSO_PADRAO);
  const iniMes = `${hoje.slice(0, 8)}01`;
  const desde = [menos(hoje, 36), iniMes].sort()[0];
  const ids = contas.map((c) => c.id);

  const [metricasR, saldosR, syncR] = await Promise.all([
    // Paginado: todas as contas × 36 dias passa fácil de 1000 linhas.
    buscarTodas((de, ate) => db.from('metricas_diarias')
      .select('conta_anuncio_id, campanha_id, data, investimento, impressoes, alcance, cliques, leads, conversas')
      .in('conta_anuncio_id', ids)
      .gte('data', desde)
      .order('conta_anuncio_id').order('data').order('campanha_id')
      .range(de, ate)),
    db.from('saldo_conta')
      .select('conta_anuncio_id, data, saldo')
      .in('conta_anuncio_id', ids)
      .gte('data', menos(hoje, 7))
      .order('data', { ascending: false }),
    // Última coleta de cada conta: tudo dos últimos 3 dias, do mais recente.
    // Sem coleta nesse intervalo, o alerta de coleta aparece — e é o certo.
    buscarTodas((de, ate) => db.from('sync_log')
      .select('conta_anuncio_id, inicio, status')
      .in('conta_anuncio_id', ids)
      .gte('inicio', `${menos(hoje, 3)}T00:00:00-03:00`)
      .order('inicio', { ascending: false }).order('id', { ascending: false })
      .range(de, ate)),
  ]);

  const num = (v: unknown) => (v == null ? null : Number(v));
  const porConta = new Map<string, LinhaMetrica[]>();
  for (const m of metricasR) {
    const lista = porConta.get(m.conta_anuncio_id) ?? [];
    lista.push({
      campanha_id: m.campanha_id, data: m.data, investimento: Number(m.investimento),
      impressoes: Number(m.impressoes), alcance: num(m.alcance), cliques: Number(m.cliques),
      leads: num(m.leads), conversas: num(m.conversas),
    });
    porConta.set(m.conta_anuncio_id, lista);
  }
  // Listas vêm ordenadas do mais recente: a primeira de cada conta vence.
  const primeiro = <T extends { conta_anuncio_id: string }>(xs: T[] | null) => {
    const m = new Map<string, T>();
    for (const x of xs ?? []) if (!m.has(x.conta_anuncio_id)) m.set(x.conta_anuncio_id, x);
    return m;
  };
  const saldos = primeiro(saldosR.data);
  const syncs = primeiro(syncR);

  const linhas: LinhaGeral[] = contas
    .map((c) => {
      const saldo = num(saldos.get(c.id)?.saldo);
      return {
        contaId: c.id,
        cliente: (c.clientes as unknown as { nome: string } | null)?.nome ?? 'Sem cliente',
        conta: c.nome,
        plataforma: c.plataforma,
        saldo,
        saude: saude({
          hoje: hojeNoFuso(c.fuso),
          plataforma: c.plataforma,
          linhas: porConta.get(c.id) ?? [],
          saldo,
          limiteAlerta: num(c.limite_alerta_saldo),
          verbaMensal: num(c.verba_mensal),
          cplMeta: num(c.cpl_meta),
          ultimaColeta: syncs.get(c.id) ?? null,
        }),
      };
    })
    .sort((a, b) => prioridade(b.saude) - prioridade(a.saude) || a.cliente.localeCompare(b.cliente, 'pt-BR'));

  return <VisaoGeral linhas={linhas} hrefConta={(id) => `/conta?conta=${id}`} />;
}
