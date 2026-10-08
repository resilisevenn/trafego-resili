// Dashboard: uma conta de anúncio por vez, escolhida no seletor.
//
// Lê SÓ do banco, nunca da API ao vivo (BRIEFING, seção 3). Usa o cliente com a
// sessão do usuário: a RLS do schema trafego garante que o gestor só recebe as
// contas dele, mesmo que alguém edite o ?conta= da URL.

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Seletor, type OpcaoConta } from '@/components/seletor';
import { GraficoBarras } from '@/components/grafico-barras';
import {
  periodoAnterior, porCampanha, resolverPeriodo, seriePorDia, totais, variacao,
  type LinhaMetrica, type Totais,
} from '@/lib/painel/agregar';
import { hojeNoFuso } from '@/lib/coleta/datas';
import {
  fmtContagem, fmtData, fmtDecimal, fmtInteiro, fmtMoeda, fmtPct, SEM_DADO,
} from '@/lib/painel/formato';

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

  const periodo = resolverPeriodo(q.periodo, hojeNoFuso(conta.fuso), q.de, q.ate);
  const anterior = periodoAnterior(periodo);

  const [metricasR, campanhasR, saldoR, syncR] = await Promise.all([
    db.from('metricas_diarias')
      .select('campanha_id, data, investimento, impressoes, alcance, cliques, leads, conversas')
      .eq('conta_anuncio_id', conta.id)
      .gte('data', anterior.de)
      .lte('data', periodo.ate),
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
  const linhas: LinhaMetrica[] = (metricasR.data ?? []).map((m) => ({
    campanha_id: m.campanha_id,
    data: m.data,
    investimento: Number(m.investimento),
    impressoes: Number(m.impressoes),
    alcance: m.alcance == null ? null : Number(m.alcance),
    cliques: Number(m.cliques),
    leads: m.leads == null ? null : Number(m.leads),
    conversas: m.conversas == null ? null : Number(m.conversas),
  }));
  const doPeriodo = linhas.filter((l) => l.data >= periodo.de);
  const atual = totais(doPeriodo);
  const antes = totais(linhas.filter((l) => l.data < periodo.de));
  const nomes = new Map((campanhasR.data ?? []).map((c) => [c.campanha_id, c]));

  const opcoes: OpcaoConta[] = contas.map((c) => ({
    id: c.id, nome: c.nome, plataforma: c.plataforma as OpcaoConta['plataforma'], cliente: c.cliente,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <Seletor contas={opcoes} contaId={conta.id} periodo={periodo.chave} de={periodo.de} ate={periodo.ate} />
      </Suspense>

      <p className="text-sm text-muted">
        {fmtData(periodo.de)} a {fmtData(periodo.ate)} · comparado com {fmtData(anterior.de)} a {fmtData(anterior.ate)}
      </p>

      <CardSaldo
        saldo={saldoR.data?.saldo == null ? null : Number(saldoR.data.saldo)}
        limite={conta.limite_alerta_saldo == null ? null : Number(conta.limite_alerta_saldo)}
        data={saldoR.data?.data}
        fonte={saldoR.data?.fonte}
      />

      <Cards atual={atual} antes={antes} plataforma={conta.plataforma} />

      <div className="grid gap-4 md:grid-cols-2">
        <GraficoBarras titulo="Investimento por dia" serie={seriePorDia(doPeriodo, periodo, 'investimento')} formatar={fmtMoeda} />
        <GraficoBarras titulo="Leads por dia" serie={seriePorDia(doPeriodo, periodo, 'leads')} formatar={fmtContagem} />
      </div>

      <TabelaCampanhas linhas={porCampanha(doPeriodo)} nomes={nomes} />

      <StatusColeta sync={syncR.data} />
    </div>
  );
}

// ── Cards de métricas ────────────────────────────────────────────────────────

// "menor é melhor" inverte a cor da variação (CPC subir é ruim).
const METRICAS: { chave: keyof Totais; rotulo: string; fmt: (v: number | null) => string; menorMelhor?: boolean; nota?: string }[] = [
  { chave: 'investimento', rotulo: 'Investimento', fmt: fmtMoeda },
  { chave: 'impressoes', rotulo: 'Impressões', fmt: fmtInteiro },
  { chave: 'alcance', rotulo: 'Alcance', fmt: fmtInteiro, nota: 'Soma dos dias: quem viu em dois dias conta duas vezes.' },
  { chave: 'frequencia', rotulo: 'Frequência', fmt: fmtDecimal, nota: 'Calculada sobre o alcance somado: tende a ficar abaixo da real.' },
  { chave: 'cliques', rotulo: 'Cliques', fmt: fmtInteiro },
  { chave: 'ctr', rotulo: 'CTR', fmt: fmtPct },
  { chave: 'cpc', rotulo: 'CPC', fmt: fmtMoeda, menorMelhor: true },
  { chave: 'cpm', rotulo: 'CPM', fmt: fmtMoeda, menorMelhor: true },
  { chave: 'leads', rotulo: 'Leads', fmt: fmtContagem },
  { chave: 'conversas', rotulo: 'Conversas', fmt: fmtContagem },
];

function Cards({ atual, antes, plataforma }: { atual: Totais; antes: Totais; plataforma: string }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {METRICAS.map((m) => {
        const v = variacao(atual[m.chave], antes[m.chave]);
        const bom = v == null ? null : m.menorMelhor ? v < 0 : v > 0;
        // Investimento subir não é "bom" nem "ruim": fica neutro.
        const neutro = m.chave === 'investimento';
        return (
          <div key={m.chave} className="card p-4" title={m.nota}>
            <div className="text-xs text-muted">{m.rotulo}{m.nota && plataforma === 'meta' ? ' *' : ''}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{m.fmt(atual[m.chave])}</div>
            <div className="text-xs mt-1 tabular-nums">
              {v == null ? (
                <span className="text-faint">{SEM_DADO}</span>
              ) : (
                <span className={neutro ? 'text-muted' : bom ? 'text-ok' : 'text-bad'}>
                  {v > 0 ? '▲' : v < 0 ? '▼' : '='} {fmtDecimal(Math.abs(v))}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Saldo ────────────────────────────────────────────────────────────────────

const FONTES: Record<string, string> = {
  spend_cap_menos_gasto: 'limite de gastos − gasto',
  account_budget: 'orçamento da conta − gasto',
  sem_limite: 'conta sem limite: sem saldo pela API',
  sem_account_budget: 'sem orçamento de conta',
};

function CardSaldo({ saldo, limite, data, fonte }: { saldo: number | null; limite: number | null; data?: string; fonte?: string }) {
  const baixo = saldo != null && limite != null && saldo < limite;
  return (
    <div className={`card p-4 flex flex-wrap items-center gap-x-6 gap-y-1 ${baixo ? 'border-bad' : ''}`}>
      <div>
        <div className="text-xs text-muted">Saldo da conta</div>
        <div className="text-2xl font-semibold tabular-nums">{fmtMoeda(saldo)}</div>
      </div>
      {baixo && (
        // Estado nunca só por cor: ícone + texto.
        <div className="text-sm text-bad font-medium" role="status">⚠ Abaixo do limite de alerta ({fmtMoeda(limite)})</div>
      )}
      <div className="text-xs text-faint ml-auto">
        {data ? `Foto de ${fmtData(data)}` : 'Ainda sem coleta'}
        {fonte ? ` · ${FONTES[fonte] ?? fonte}` : ''}
        {limite == null ? ' · sem limite de alerta definido' : ''}
      </div>
    </div>
  );
}

// ── Tabela de campanhas ──────────────────────────────────────────────────────

function TabelaCampanhas({ linhas, nomes }: {
  linhas: ReturnType<typeof porCampanha>;
  nomes: Map<string, { nome: string; status: string | null }>;
}) {
  if (!linhas.length) return <Aviso titulo="Sem dados no período">Nenhuma campanha veiculou nestes dias.</Aviso>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted text-right">
          <tr className="border-b border-border">
            <th className="text-left p-3 font-medium">Campanha</th>
            <th className="p-3 font-medium">Investimento</th>
            <th className="p-3 font-medium">Impressões</th>
            <th className="p-3 font-medium">Cliques</th>
            <th className="p-3 font-medium">CTR</th>
            <th className="p-3 font-medium">CPC</th>
            <th className="p-3 font-medium">CPM</th>
            <th className="p-3 font-medium">Leads</th>
            <th className="p-3 font-medium">Conversas</th>
          </tr>
        </thead>
        <tbody className="text-right">
          {linhas.map((c) => {
            const info = nomes.get(c.campanha_id);
            return (
              <tr key={c.campanha_id} className="border-b border-border last:border-0">
                <td className="text-left p-3">
                  <div>{info?.nome ?? c.campanha_id}</div>
                  {info?.status && <div className="text-xs text-faint">{info.status}</div>}
                </td>
                <td className="p-3">{fmtMoeda(c.investimento)}</td>
                <td className="p-3">{fmtInteiro(c.impressoes)}</td>
                <td className="p-3">{fmtInteiro(c.cliques)}</td>
                <td className="p-3">{fmtPct(c.ctr)}</td>
                <td className="p-3">{fmtMoeda(c.cpc)}</td>
                <td className="p-3">{fmtMoeda(c.cpm)}</td>
                <td className="p-3">{fmtContagem(c.leads)}</td>
                <td className="p-3">{fmtContagem(c.conversas)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Status e avisos ──────────────────────────────────────────────────────────

function StatusColeta({ sync }: { sync: { inicio: string; status: string; erro: string | null; linhas: number | null } | null }) {
  if (!sync) return <p className="text-xs text-faint">Coleta: ainda não rodou para esta conta.</p>;
  const quando = new Date(sync.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return (
    <p className={`text-xs ${sync.status === 'erro' ? 'text-bad' : 'text-faint'}`}>
      Última coleta: {quando} ·{' '}
      {sync.status === 'ok' ? `ok (${sync.linhas} linhas)` : sync.status === 'erro' ? `⚠ erro: ${sync.erro}` : 'rodando…'}
    </p>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-sm text-muted mt-1">{children}</p>
    </div>
  );
}
