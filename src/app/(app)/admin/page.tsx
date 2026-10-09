// Admin (só admin): usuários do tráfego. BRIEFING-ADMIN.md, etapa 1.
// Criar gestor, nova senha provisória, desativar/reativar e as contas que cada
// gestor vê (antes "Acesso dos gestores", na Configuração).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { salvarAcesso } from '../config/acoes';
import { criarGestor, desativarGestor, listarUsuarios, novaSenhaProvisoria, reativarGestor, type Usuario } from './acoes';
import { CriarGestor } from '@/components/criar-gestor';
import { BotaoAcao } from '@/components/botao-acao';
import { BotaoNovaSenha } from '@/components/botao-nova-senha';

const PLATAFORMA = { meta: 'Meta', google: 'Google' } as Record<string, string>;

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});

function status(u: Usuario) {
  if (!u.papel) return { texto: 'Desativado', cor: 'text-bad' };
  if (u.trocarSenha) return { texto: 'Aguardando 1º acesso', cor: 'text-warn' };
  return { texto: 'Ativo', cor: 'text-ok' };
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc('is_admin');
  if (!admin) redirect('/');

  const db = supabase.schema('trafego');
  const [usuarios, contasR, acessosR] = await Promise.all([
    listarUsuarios(),
    db.from('contas_anuncio').select('id, nome, plataforma').eq('ativa', true).order('plataforma').order('nome'),
    db.from('acesso_conta').select('user_id, conta_anuncio_id'),
  ]);
  const contas = contasR.data ?? [];
  const acessos = acessosR.data ?? [];
  const erro = [contasR, acessosR].find((r) => r.error)?.error;

  const admins = usuarios.filter((u) => u.papel === 'admin');
  const gestores = usuarios.filter((u) => u.papel !== 'admin');

  return (
    <div className="flex flex-col gap-10">
      <h1 className="font-display text-3xl">Admin</h1>
      {erro && <p className="text-sm text-bad" role="alert">⚠ Erro ao ler as contas: {erro.message}</p>}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl">Novo gestor</h2>
          <p className="text-sm text-muted mt-1">
            Cria o login com uma senha provisória. Sem e-mail: você envia a senha pelo WhatsApp.
          </p>
        </div>
        <CriarGestor acao={criarGestor} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-10">
        <div>
          <h2 className="font-display text-2xl">Gestores</h2>
          <p className="text-sm text-muted mt-1">
            O gestor só vê as contas marcadas na ficha dele. Quem barra é o banco, não a tela.
            Desativar tira o acesso ao tráfego sem apagar o login (ele é compartilhado com o Carteira).
          </p>
        </div>
        {!gestores.length && <p className="text-sm text-muted">Nenhum gestor ainda.</p>}

        {gestores.map((g) => {
          const s = status(g);
          const dele = new Set(acessos.filter((a) => a.user_id === g.id).map((a) => a.conta_anuncio_id));
          return (
            <div key={g.id} className="card p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{g.nome ?? g.email}</div>
                  <div className="text-sm text-muted">
                    {g.nome && <>{g.email} · </>}
                    <span className={s.cor}>{s.texto}</span>
                    {' · '}último acesso {g.ultimoAcesso ? dataHora.format(new Date(g.ultimoAcesso)) : 'nunca'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {g.papel && (
                    <BotaoNovaSenha acao={novaSenhaProvisoria.bind(null, g.id)} />
                  )}
                  <BotaoAcao
                    rotulo={g.papel ? 'Desativar' : 'Reativar'}
                    rotuloPendente={g.papel ? 'Desativando…' : 'Reativando…'}
                    acao={(g.papel ? desativarGestor : reativarGestor).bind(null, g.id)}
                  />
                </div>
              </div>

              {g.papel && (
                // Chave com as contas salvas: o React 19 reseta o formulário para os
                // valores iniciais depois da ação (mesmo cuidado da Configuração).
                <form key={JSON.stringify([...dele].sort())} action={salvarAcesso}>
                  <input type="hidden" name="user_id" value={g.id} />
                  <div className="label mb-2">Contas que vê</div>
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    {contas.map((c) => (
                      <label key={c.id} className="flex items-center gap-2">
                        <input type="checkbox" name="contas" value={c.id} defaultChecked={dele.has(c.id)} />
                        <span>{c.nome} <span className="text-faint">({PLATAFORMA[c.plataforma]})</span></span>
                      </label>
                    ))}
                  </div>
                  <button className="btn mt-3" type="submit">Salvar contas</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-10">
        <div>
          <h2 className="font-display text-2xl">Admins</h2>
          <p className="text-sm text-muted mt-1">
            Admin vê todas as contas e o Carteira. Só leitura aqui: admin é dado direto no banco.
          </p>
        </div>
        <ul className="text-sm flex flex-col gap-1">
          {admins.map((a) => (
            <li key={a.id}>
              {a.nome ?? a.email}{a.nome && <span className="text-muted"> · {a.email}</span>}
              <span className="text-faint"> · último acesso {a.ultimoAcesso ? dataHora.format(new Date(a.ultimoAcesso)) : 'nunca'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
