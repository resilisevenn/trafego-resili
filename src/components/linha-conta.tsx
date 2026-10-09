'use client';

// Uma linha da tabela "Contas de anúncio" da Configuração.
// Acompanha o que foi digitado para saber se há alteração: sem alteração, o
// botão Salvar fica desabilitado e a linha mostra "✓ Salvo"; com alteração, a
// linha ganha destaque até salvar. A comparação usa o VALOR (lerReais), então
// trocar "1500" por "1.500,00" não conta como mudança.

import { useActionState, useState } from 'react';
import { lerReais } from '@/lib/painel/formato';
import { situacaoSaldo, type InfoSaldo } from '@/lib/painel/saldo';

export type ContaConfig = {
  id: string;
  nome: string;
  plataforma: string;
  conta_id: string;
  cliente_id: string | null;
  alerta_saldo_dias: number;
  verba_mensal: number | null;
  cpl_meta: number | null;
  ativa: boolean;
};

const PLATAFORMA: Record<string, string> = { meta: 'Meta', google: 'Google' };
const paraTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
const mesmoValor = (texto: string, salvo: number | null) => {
  const v = lerReais(texto);
  return Number.isNaN(v) ? false : v === (salvo == null ? null : Number(salvo));
};

// Atalhos do aviso de saldo, em dias: o tempo de alguém ver o aviso e o cliente
// recarregar o boleto ou subir o teto.
const DIAS_SUGERIDOS = [3, 5, 7];

export function LinhaConta({ conta, saldo, clientes, acao }: {
  conta: ContaConfig;
  saldo: InfoSaldo; // última foto de saldo: boleto, teto de gastos ou sem teto
  clientes: { id: string; nome: string; ativo: boolean }[];
  acao: (form: FormData) => Promise<void>;
}) {
  const [clienteId, setClienteId] = useState(conta.cliente_id ?? '');
  const [dias, setDias] = useState(String(conta.alerta_saldo_dias));
  const [verba, setVerba] = useState(paraTexto(conta.verba_mensal));
  const [cplMeta, setCplMeta] = useState(paraTexto(conta.cpl_meta));
  const [ativa, setAtiva] = useState(conta.ativa);

  const [erro, salvar, salvando] = useActionState(async (_: string | null, form: FormData) => {
    try {
      await acao(form);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, null);

  const alterada =
    clienteId !== (conta.cliente_id ?? '') ||
    (dias.trim() === '' ? 3 : Number(dias)) !== conta.alerta_saldo_dias ||
    !mesmoValor(verba, conta.verba_mensal) ||
    !mesmoValor(cplMeta, conta.cpl_meta) ||
    ativa !== conta.ativa;

  const situacao = situacaoSaldo(saldo, conta.plataforma);
  const form = `conta-${conta.id}`;

  return (
    <tr className={`border-b border-border last:border-0 ${alterada ? 'bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]' : ''}`}>
      {/* Todas as células pelo TOPO; o que não é campo fica numa faixa de 36 px
          (altura do .input), para tudo cair na mesma linha horizontal dos campos.
          Os textos de ajuda embaixo dos campos crescem para baixo sem empurrar nada. */}
      <td className="p-3 align-top">
        <div className="min-h-9 flex flex-col justify-center">
          <div className="leading-tight">{conta.nome}</div>
          <div className="text-xs text-faint">{PLATAFORMA[conta.plataforma]} · {conta.conta_id}</div>
        </div>
      </td>
      {/* form= liga os campos da linha ao form da última célula (form não pode envolver <tr>). */}
      <td className="p-3 align-top">
        <select name="cliente_id" form={form} className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Sem cliente</option>
          {clientes.filter((x) => x.ativo || x.id === conta.cliente_id).map((x) => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
        </select>
      </td>
      <td className="p-3 align-top">
        <input
          name="verba" form={form} className="input w-28 tabular-nums" inputMode="decimal"
          value={verba} onChange={(e) => setVerba(e.target.value)}
        />
      </td>
      <td className="p-3 align-top">
        <input
          name="alerta_dias" form={form} type="number" min={1} max={30}
          className={`input w-20 tabular-nums ${situacao.alertaAplica ? '' : 'opacity-50'}`}
          value={dias} onChange={(e) => setDias(e.target.value)}
        />
        {situacao.alertaAplica && (
          <div className="flex gap-2 mt-1 text-[11px]">
            {DIAS_SUGERIDOS.map((d) => (
              <button
                key={d}
                type="button"
                className={`underline decoration-dotted ${String(d) === dias ? 'text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setDias(String(d))}
              >
                {d}d
              </button>
            ))}
          </div>
        )}
        <div className="text-[11px] text-faint mt-1 max-w-40 leading-tight" title={situacao.detalhe}>
          {situacao.rotulo}{situacao.detalhe ? ` · ${situacao.detalhe}` : ''}
          {!situacao.alertaAplica && ': aviso de saldo não se aplica'}
        </div>
      </td>
      <td className="p-3 align-top">
        <input
          name="cpl_meta" form={form} className="input w-28 tabular-nums" inputMode="decimal"
          value={cplMeta} onChange={(e) => setCplMeta(e.target.value)}
        />
      </td>
      <td className="p-3 align-top">
        <div className="h-9 flex items-center">
          <input name="ativa" form={form} type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
        </div>
      </td>
      <td className="p-3 align-top text-right whitespace-nowrap">
        <form id={form} action={salvar} className="h-9 inline-flex items-center gap-2">
          <input type="hidden" name="id" value={conta.id} />
          {erro && <span className="text-xs text-bad" role="alert">⚠ {erro}</span>}
          {!alterada && !erro && <span className="text-xs text-faint">✓ Salvo</span>}
          <button className={`btn ${alterada ? 'btn-primary' : ''}`} type="submit" disabled={!alterada || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </td>
    </tr>
  );
}
