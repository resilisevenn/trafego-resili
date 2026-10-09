// Prévia LOCAL do dashboard de UMA conta, com dados FICTÍCIOS, para ajustar o visual sem
// Supabase. Só existe em `npm run dev`: em produção responde 404.
// Fica fora do proxy de login (src/proxy.ts) e não toca no banco.

import { notFound } from 'next/navigation';
import { Painel } from '@/components/painel';
import { BotaoAtualizar } from '@/components/botao-atualizar';
import { diasDoPeriodo, periodoAnterior, resolverPeriodo } from '@/lib/painel/agregar';
import { CAMPANHAS, CONTAS, linhasFicticias } from '../dados';
import { hojeNoFuso } from '@/lib/coleta/datas';

// Prévia: finge a coleta (2 s) sem chamar nenhuma plataforma.
async function atualizarFicticio() {
  'use server';
  // A página some em produção, mas a ação ficaria acessível: barra aqui também.
  if (process.env.NODE_ENV !== 'development') throw new Error('Só na prévia local.');
  await new Promise((r) => setTimeout(r, 2000));
  return { ok: true, mensagem: 'Atualizado agora (prévia: nada foi coletado).' };
}

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PreviaConta({ searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const q = await searchParams;
  const conta = CONTAS.find((c) => c.id === q.conta) ?? CONTAS[0];
  const hoje = hojeNoFuso('America/Sao_Paulo');
  // Prévia: "Máximo" finge que os dados começam em 01/06.
  const periodo = resolverPeriodo(q.periodo, hoje, q.de, q.ate, `${hoje.slice(0, 4)}-06-01`);
  const anterior = periodoAnterior(periodo);

  return (
    <Painel
      opcoes={CONTAS}
      contaId={conta.id}
      plataforma={conta.plataforma}
      periodo={periodo}
      anterior={anterior}
      linhas={linhasFicticias(conta.id, conta.plataforma, diasDoPeriodo({ de: anterior && anterior.de < periodo.de ? anterior.de : periodo.de, ate: periodo.ate }))}
      nomes={new Map(CAMPANHAS[conta.id].map(([id, nome]) => [id, { nome, status: 'ACTIVE' }]))}
      saldo={{ saldo: conta.saldo, teto: conta.teto, data: hoje, fonte: conta.fonte }}
      alertaDias={conta.alertaDias}
      diasDeSaldo={conta.saldo != null ? conta.saldo / 45 : null}
      sync={{
        inicio: new Date().toISOString(),
        status: conta.erro ? 'erro' : 'ok',
        erro: conta.erro ?? null,
        linhas: conta.erro ? null : CAMPANHAS[conta.id].length * 8,
      }}
      voltar="/previa"
      atualizar={<BotaoAtualizar contaId={conta.id} acao={atualizarFicticio} />}
    />
  );
}
