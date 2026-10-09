// Configuração (só admin): clientes, contas e relatório. Usuários e o acesso
// de cada gestor às contas ficam no /admin (BRIEFING-ADMIN.md).
// BRIEFING, seção 10. Formulários simples com server actions, um por bloco,
// para uma alteração não arrastar as outras.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabase/paginar';
import { alternarCliente, buscarContasAgora, criarCliente, excluirCliente, salvarConta, salvarRelatorio } from './acoes';
import { LinhaConta } from '@/components/linha-conta';
import { ExcluirCliente } from '@/components/excluir-cliente';
import { BotaoAcao } from '@/components/botao-acao';
import type { InfoSaldo } from '@/lib/painel/saldo';
import { CardRelatorio } from '@/components/card-relatorio';
import { FiltroPlataforma, lerFiltro } from '@/components/filtro-plataforma';

// O botão "Buscar contas novas" coleta todas as contas nesta requisição.
export const maxDuration = 300;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function ConfigPage({ searchParams }: Props) {
  // Filtro da tabela de contas por plataforma (?plataforma=meta|google). Fica na
  // URL: continua aplicado depois de salvar uma linha ou recarregar.
  // Um parâmetro por seção: ?plataforma= (contas) e ?relatorio= (relatório).
  const params = await searchParams;
  const filtro = lerFiltro(params.plataforma);
  const filtroRelatorio = lerFiltro(params.relatorio);
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_admin');
  if (!admin) redirect('/');

  const db = supabase.schema('trafego');
  const [clientesR, contasR, configR, campanhasR, saldosR] = await Promise.all([
    db.from('clientes').select('id, nome, ativo').order('nome'),
    db.from('contas_anuncio').select('id, nome, plataforma, conta_id, cliente_id, alerta_saldo_dias, verba_mensal, cpl_meta, ativa').order('plataforma').order('nome'),
    db.from('relatorio_config').select('conta_anuncio_id, incluir, metricas, campanhas'),
    // Paginado: somando todas as contas, as campanhas passam de 1000 com o tempo.
    buscarTodas((de, ate) => db.from('campanhas').select('conta_anuncio_id, campanha_id, nome, status')
      .order('nome').order('conta_anuncio_id').order('campanha_id').range(de, ate)),
    // Fonte da última foto de saldo: diz se a conta TEM saldo para alertar.
    db.from('saldo_conta').select('conta_anuncio_id, fonte, saldo, teto, data').order('data', { ascending: false }).limit(500),
  ]);

  const clientes = clientesR.data ?? [];
  const contas = contasR.data ?? [];
  // Última foto de saldo de cada conta (lista vem do mais novo): a situação
  // (boleto, teto de gastos, cartão sem teto) aparece na linha da conta.
  const fotoSaldo = new Map<string, InfoSaldo>();
  for (const s of saldosR.data ?? []) {
    if (fotoSaldo.has(s.conta_anuncio_id)) continue;
    fotoSaldo.set(s.conta_anuncio_id, {
      fonte: s.fonte, saldo: s.saldo == null ? null : Number(s.saldo), teto: s.teto == null ? null : Number(s.teto),
    });
  }
  const configs = new Map((configR.data ?? []).map((c) => [c.conta_anuncio_id, c]));
  const campanhasDa = (id: string) => campanhasR.filter((c) => c.conta_anuncio_id === id);
  const erro = [clientesR, contasR, configR].find((r) => r.error)?.error;

  // Chave = id + valores salvos. O React 19 reseta o formulário depois de cada
  // ação para os valores INICIAIS da tela; sem isto, a linha recém-salva voltava
  // a mostrar o valor antigo ("Sem cliente") até recarregar a página. Com os
  // valores na chave, a linha é recriada com o que acabou de ser gravado.
  const versao = (...v: unknown[]) => JSON.stringify(v);
  const contasFiltradas = filtro ? contas.filter((c) => c.plataforma === filtro) : contas;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-3xl">Configuração</h1>
      {erro && <p className="text-sm text-bad" role="alert">⚠ Erro ao ler a configuração: {erro.message}</p>}

      {/* ── Clientes ── */}
      <Secao titulo="Clientes" ajuda="Cliente da agência no tráfego. Não é o cadastro do Carteira. Para excluir, desative primeiro.">
        <form action={criarCliente} className="flex gap-2 mb-4">
          <input name="nome" className="input max-w-xs" placeholder="Nome do cliente" required />
          <button className="btn btn-primary" type="submit">Adicionar</button>
        </form>
        <ul className="flex flex-col gap-1 text-sm">
          {clientes.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className={c.ativo ? '' : 'text-faint line-through'}>{c.nome}</span>
              <form action={alternarCliente}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="ativo" value={String(!c.ativo)} />
                <button className="text-xs text-faint hover:text-foreground" type="submit">
                  {c.ativo ? 'desativar' : 'reativar'}
                </button>
              </form>
              {!c.ativo && (
                <ExcluirCliente
                  id={c.id}
                  nome={c.nome}
                  contasLigadas={contas.filter((x) => x.cliente_id === c.id).length}
                  acao={excluirCliente}
                />
              )}
            </li>
          ))}
        </ul>
      </Secao>

      {/* ── Contas ── */}
      <Secao
        titulo="Contas de anúncio"
        acao={
          // Coluna: "Buscar contas novas" em cima, filtros embaixo, tudo à direita.
          <div className="flex flex-col items-end gap-2">
            <BotaoAcao rotulo="↻ Buscar contas novas e coletar agora" rotuloPendente="Buscando na Meta e no Google…" acao={buscarContasAgora} />
            <FiltroPlataforma caminho="/config" parametro="plataforma" atual={filtro} params={params} />
          </div>
        }
        ajuda="Contas novas entram sozinhas na coleta das 06h, ou na hora pelo botão ao lado. Ligue cada uma a um cliente. Verba e meta de custo por resultado são os combinados com o cliente (vazio = sem alerta). O aviso de saldo é em dias: quanto o saldo dura no ritmo atual.">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted text-left align-bottom">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Conta</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium" title="Quanto o cliente combinou de investir por mês. Base do alerta de ritmo da verba.">Verba mensal (R$)</th>
                <th className="p-3 font-medium" title="Avisar quando o saldo (crédito do boleto ou o que falta até o teto de gastos) durar menos que estes dias, no ritmo dos últimos 7 dias. Alerta no painel e, com o n8n ligado, no WhatsApp.">Avisar com (dias)</th>
                <th className="p-3 font-medium" title="Custo por resultado combinado com o cliente: por lead, ou por conversa nas contas de mensagem. Acima dele, alerta na visão geral.">Meta de custo/resultado (R$)</th>
                <th className="p-3 font-medium">Ativa</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {contasFiltradas.map((c) => (
                // A chave muda quando os valores salvos mudam: a linha renasce
                // com o estado do banco depois de salvar.
                <LinhaConta
                  key={versao(c.id, c.cliente_id, c.alerta_saldo_dias, c.verba_mensal, c.cpl_meta, c.ativa)}
                  conta={c}
                  saldo={fotoSaldo.get(c.id) ?? { fonte: null, saldo: null, teto: null }}
                  clientes={clientes}
                  acao={salvarConta}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* ── Relatório de segunda ── */}
      <Secao
        titulo="Relatório de segunda"
        ajuda="O que entra na mensagem de cada conta. Tudo marcado inclui também campanhas que surgirem depois."
        acao={<FiltroPlataforma caminho="/config" parametro="relatorio" atual={filtroRelatorio} params={params} />}
      >
        <div className="flex flex-col gap-4">
          {contas.filter((c) => c.ativa && (!filtroRelatorio || c.plataforma === filtroRelatorio)).map((c) => {
            const cfg = configs.get(c.id);
            const camps = campanhasDa(c.id);
            return (
              // A chave muda quando o salvo muda: o card renasce com o estado do banco.
              <CardRelatorio
                key={versao(c.id, cfg?.incluir, cfg?.metricas, cfg?.campanhas, camps.length)}
                conta={c}
                config={cfg ?? null}
                campanhas={camps}
                acao={salvarRelatorio}
              />
            );
          })}
        </div>
      </Secao>
    </div>
  );
}

// `acao`: botões à direita da descrição, na mesma linha (no celular, descem).
function Secao({ titulo, ajuda, acao, children }: {
  titulo: string;
  ajuda: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Linha divisória ENTRE os blocos: a primeira seção (Clientes) não tem linha em cima.
    <section className="border-t border-border pt-10 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="font-display text-2xl">{titulo}</h2>
      {/* Texto à esquerda e botões à direita NA MESMA LINHA (não quebra a partir de
          tela média). No celular, os botões descem e ficam à direita. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6 mt-1 mb-4">
        <p className="text-sm text-muted max-w-2xl md:flex-1">{ajuda}</p>
        {acao && <div className="self-end md:self-start shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  );
}
