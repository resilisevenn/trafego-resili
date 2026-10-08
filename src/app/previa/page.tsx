// Prévia LOCAL da visão geral, com dados FICTÍCIOS (./dados.ts). Só em
// `npm run dev`: em produção responde 404. Fora do proxy de login.

import { notFound } from 'next/navigation';
import { VisaoGeral } from '@/components/visao-geral';
import { diasDoPeriodo } from '@/lib/painel/agregar';
import { hojeNoFuso } from '@/lib/coleta/datas';
import { prioridade, saude } from '@/lib/painel/saude';
import { CONTAS, linhasFicticias } from './dados';

export default function PreviaGeral() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const hoje = hojeNoFuso('America/Sao_Paulo');
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const ontem = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 40);
  const dias = diasDoPeriodo({ de: d.toISOString().slice(0, 10), ate: hoje });

  const linhas = CONTAS.map((c) => ({
    contaId: c.id,
    cliente: c.cliente,
    conta: c.nome,
    plataforma: c.plataforma,
    saldo: c.saldo,
    saude: saude({
      hoje,
      plataforma: c.plataforma,
      linhas: linhasFicticias(c.id, c.plataforma, dias, ontem),
      saldo: c.saldo,
      limiteAlerta: c.limite,
      verbaMensal: c.verba,
      cplMeta: c.cplMeta,
      ultimaColeta: c.id === 'novo' ? null : { inicio: new Date().toISOString(), status: c.erro ? 'erro' : 'ok' },
    }),
  })).sort((a, b) => prioridade(b.saude) - prioridade(a.saude));

  return <VisaoGeral linhas={linhas} hrefConta={(id) => `/previa/conta?conta=${id}`} />;
}
