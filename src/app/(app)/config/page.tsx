// Configuração (só admin): clientes, contas, acesso dos gestores e relatório.
// BRIEFING, seção 10. Formulários simples com server actions, um por bloco,
// para uma alteração não arrastar as outras.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buscarTodas } from '@/lib/supabase/paginar';
import { alternarCliente, criarCliente, salvarAcesso, salvarConta, salvarRelatorio } from './acoes';
import { METRICAS_RELATORIO } from '@/lib/painel/metricas';

const PLATAFORMA = { meta: 'Meta', google: 'Google' } as Record<string, string>;

export default async function ConfigPage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_admin');
  if (!admin) redirect('/');

  const db = supabase.schema('trafego');
  const [clientesR, contasR, acessosR, configR, campanhasR, gestoresR] = await Promise.all([
    db.from('clientes').select('id, nome, ativo').order('nome'),
    db.from('contas_anuncio').select('id, nome, plataforma, conta_id, cliente_id, limite_alerta_saldo, verba_mensal, cpl_meta, ativa').order('plataforma').order('nome'),
    db.from('acesso_conta').select('user_id, conta_anuncio_id'),
    db.from('relatorio_config').select('conta_anuncio_id, incluir, metricas, campanhas'),
    // Paginado: somando todas as contas, as campanhas passam de 1000 com o tempo.
    buscarTodas((de, ate) => db.from('campanhas').select('conta_anuncio_id, campanha_id, nome, status')
      .order('nome').order('conta_anuncio_id').order('campanha_id').range(de, ate)),
    db.rpc('listar_gestores'),
  ]);

  const clientes = clientesR.data ?? [];
  const contas = contasR.data ?? [];
  const gestores = (gestoresR.data ?? []) as { user_id: string; email: string }[];
  const acessos = acessosR.data ?? [];
  const configs = new Map((configR.data ?? []).map((c) => [c.conta_anuncio_id, c]));
  const campanhasDa = (id: string) => campanhasR.filter((c) => c.conta_anuncio_id === id);
  const erro = [clientesR, contasR, acessosR, configR, gestoresR].find((r) => r.error)?.error;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-lg font-semibold">Configuração</h1>
      {erro && <p className="text-sm text-bad" role="alert">⚠ Erro ao ler a configuração: {erro.message}</p>}

      {/* ── Clientes ── */}
      <Secao titulo="Clientes" ajuda="Cliente da agência no tráfego. Não é o cadastro do Carteira.">
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
            </li>
          ))}
        </ul>
      </Secao>

      {/* ── Contas ── */}
      <Secao titulo="Contas de anúncio" ajuda="Contas novas entram sozinhas na coleta. Ligue cada uma a um cliente. Campos vazios = sem alerta. Verba e meta de CPL são os valores combinados com o cliente.">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted text-left">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Conta</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Limite de alerta (R$)</th>
                <th className="p-3 font-medium">Verba mensal (R$)</th>
                <th className="p-3 font-medium">Meta de CPL (R$)</th>
                <th className="p-3 font-medium">Ativa</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div>{c.nome}</div>
                    <div className="text-xs text-faint">{PLATAFORMA[c.plataforma]} · {c.conta_id}</div>
                  </td>
                  {/* form= liga os campos da linha ao form da última célula (form não pode envolver <tr>). */}
                  <td className="p-3">
                    <select name="cliente_id" form={`conta-${c.id}`} className="input" defaultValue={c.cliente_id ?? ''}>
                      <option value="">Sem cliente</option>
                      {clientes.filter((x) => x.ativo || x.id === c.cliente_id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      name="limite" form={`conta-${c.id}`} className="input w-32 tabular-nums" inputMode="decimal"
                      defaultValue={c.limite_alerta_saldo == null ? '' : String(c.limite_alerta_saldo).replace('.', ',')}
                    />
                  </td>
                  {(['verba', 'cpl_meta'] as const).map((campo) => {
                    const v = campo === 'verba' ? c.verba_mensal : c.cpl_meta;
                    return (
                      <td key={campo} className="p-3">
                        <input
                          name={campo} form={`conta-${c.id}`} className="input w-28 tabular-nums" inputMode="decimal"
                          defaultValue={v == null ? '' : String(v).replace('.', ',')}
                        />
                      </td>
                    );
                  })}
                  <td className="p-3">
                    <input name="ativa" form={`conta-${c.id}`} type="checkbox" defaultChecked={c.ativa} />
                  </td>
                  <td className="p-3 text-right">
                    <form id={`conta-${c.id}`} action={salvarConta}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn" type="submit">Salvar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* ── Acesso dos gestores ── */}
      <Secao titulo="Acesso dos gestores" ajuda="O gestor só vê as contas marcadas aqui. Quem barra é o banco, não a tela.">
        {!gestores.length && (
          <p className="text-sm text-muted">
            Nenhum gestor cadastrado. Crie o usuário no Supabase e dê o papel &quot;gestor&quot; em user_roles.
          </p>
        )}
        <div className="flex flex-col gap-4">
          {gestores.map((g) => {
            const dele = new Set(acessos.filter((a) => a.user_id === g.user_id).map((a) => a.conta_anuncio_id));
            return (
              <form key={g.user_id} action={salvarAcesso} className="card p-4">
                <input type="hidden" name="user_id" value={g.user_id} />
                <div className="font-medium text-sm mb-3">{g.email}</div>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  {contas.map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input type="checkbox" name="contas" value={c.id} defaultChecked={dele.has(c.id)} />
                      <span>{c.nome} <span className="text-faint">({PLATAFORMA[c.plataforma]})</span></span>
                    </label>
                  ))}
                </div>
                <button className="btn mt-3" type="submit">Salvar acesso</button>
              </form>
            );
          })}
        </div>
      </Secao>

      {/* ── Relatório de segunda ── */}
      <Secao titulo="Relatório de segunda" ajuda="O que entra na mensagem de cada conta. Tudo marcado inclui também campanhas que surgirem depois.">
        <div className="flex flex-col gap-4">
          {contas.filter((c) => c.ativa).map((c) => {
            const cfg = configs.get(c.id);
            const camps = campanhasDa(c.id);
            return (
              <form key={c.id} action={salvarRelatorio} className="card p-4">
                <input type="hidden" name="conta_id" value={c.id} />
                <input type="hidden" name="total_campanhas" value={camps.length} />
                <label className="flex items-center gap-2 font-medium text-sm">
                  <input type="checkbox" name="incluir" defaultChecked={cfg?.incluir ?? true} />
                  {c.nome} <span className="text-faint font-normal">({PLATAFORMA[c.plataforma]})</span>
                </label>
                {!c.cliente_id && <p className="text-xs text-bad mt-1">⚠ Sem cliente: não entra no relatório até ser ligada a um.</p>}

                <div className="label mt-3">Métricas</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {METRICAS_RELATORIO.map(([chave, rotulo]) => (
                    <label key={chave} className="flex items-center gap-1">
                      <input type="checkbox" name="metricas" value={chave} defaultChecked={!cfg?.metricas || cfg.metricas.includes(chave)} />
                      {rotulo}
                    </label>
                  ))}
                </div>

                <div className="label mt-3">Campanhas</div>
                {!camps.length && <p className="text-xs text-faint">Nenhuma campanha coletada ainda.</p>}
                <div className="flex flex-col gap-1 text-sm">
                  {camps.map((k) => (
                    <label key={k.campanha_id} className="flex items-center gap-2">
                      <input type="checkbox" name="campanhas" value={k.campanha_id} defaultChecked={!cfg?.campanhas || cfg.campanhas.includes(k.campanha_id)} />
                      {k.nome} <span className="text-xs text-faint">{k.status}</span>
                    </label>
                  ))}
                </div>
                <button className="btn mt-3" type="submit">Salvar relatório</button>
              </form>
            );
          })}
        </div>
      </Secao>
    </div>
  );
}

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-sm text-muted mt-1 mb-4">{ajuda}</p>
      {children}
    </section>
  );
}
