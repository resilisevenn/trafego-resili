'use client';

// Card de uma conta no "Relatório de segunda" da Configuração.
// Mesmo padrão da linha de conta: acompanha o que foi marcado; sem alteração,
// "Salvar relatório" fica desabilitado com "✓ Salvo"; com alteração, o card
// ganha destaque até salvar. Comparação por CONJUNTO (a ordem não importa).

import { useActionState, useState } from 'react';
import { LogoPlataforma } from '@/components/logo-plataforma';
import { METRICAS_RELATORIO } from '@/lib/painel/metricas';

const PLATAFORMA: Record<string, string> = { meta: 'Meta', google: 'Google' };
const TODAS_METRICAS = METRICAS_RELATORIO.map(([chave]) => chave as string);

const mesmoConjunto = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function CardRelatorio({ conta, config, campanhas, acao }: {
  conta: { id: string; nome: string; plataforma: string; cliente_id: string | null };
  // Nulo em metricas/campanhas = "todas", como no banco.
  config: { incluir: boolean; metricas: string[] | null; campanhas: string[] | null } | null;
  campanhas: { campanha_id: string; nome: string; status: string | null }[];
  acao: (form: FormData) => Promise<void>;
}) {
  const inicial = {
    incluir: config?.incluir ?? true,
    metricas: new Set(config?.metricas ?? TODAS_METRICAS),
    campanhas: new Set(config?.campanhas ?? campanhas.map((k) => k.campanha_id)),
  };
  const [incluir, setIncluir] = useState(inicial.incluir);
  const [metricas, setMetricas] = useState(inicial.metricas);
  const [marcadas, setMarcadas] = useState(inicial.campanhas);
  // Fechado por padrão: a lista de contas fica curta; abre para marcar.
  const [aberto, setAberto] = useState(false);

  const [erro, salvar, salvando] = useActionState(async (_: string | null, form: FormData) => {
    try {
      await acao(form);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, null);

  const alterado =
    incluir !== inicial.incluir ||
    !mesmoConjunto(metricas, inicial.metricas) ||
    !mesmoConjunto(marcadas, inicial.campanhas);

  const alternar = (conjunto: Set<string>, mudar: (s: Set<string>) => void, chave: string) => {
    const novo = new Set(conjunto);
    if (novo.has(chave)) novo.delete(chave);
    else novo.add(chave);
    mudar(novo);
  };

  return (
    <form
      action={salvar}
      className={`card ${alterado ? 'bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]' : ''}`}
    >
      <input type="hidden" name="conta_id" value={conta.id} />
      <input type="hidden" name="total_campanhas" value={campanhas.length} />

      {/* Linha sempre visível: abrir/fechar, incluir, nome, resumo e Salvar. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <button
          type="button"
          className="text-muted hover:text-foreground w-5 text-left"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-label={aberto ? 'Recolher' : 'Expandir'}
        >
          {aberto ? '▾' : '▸'}
        </button>
        <input
          type="checkbox" name="incluir" checked={incluir} onChange={(e) => setIncluir(e.target.checked)}
          aria-label="Incluir no relatório de segunda" title="Incluir no relatório de segunda"
        />
        <button type="button" className="flex items-center gap-2 font-medium text-sm text-left" onClick={() => setAberto((a) => !a)}>
          <LogoPlataforma plataforma={conta.plataforma as 'meta' | 'google'} />
          {conta.nome} <span className="text-faint font-normal">({PLATAFORMA[conta.plataforma]})</span>
        </button>
        <span className="text-xs text-faint">
          {incluir
            ? `${metricas.size} de ${TODAS_METRICAS.length} métricas · ${marcadas.size} de ${campanhas.length} campanha(s)`
            : 'fora do relatório'}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {erro && <span className="text-xs text-bad" role="alert">⚠ {erro}</span>}
          {!alterado && !erro && <span className="text-xs text-faint">✓ Salvo</span>}
          <button className={`btn ${alterado ? 'btn-primary' : ''}`} type="submit" disabled={!alterado || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        {!conta.cliente_id && <p className="w-full text-xs text-bad pl-8">⚠ Sem cliente: não entra no relatório até ser ligada a um.</p>}
      </div>

      {/* Escondido, NÃO removido: fechado, as marcações continuam no formulário.
          Sem isso, salvar com o card fechado gravaria "nenhuma métrica". */}
      <div hidden={!aberto} className="border-t border-border px-4 pb-4 pl-12">
        <div className="label mt-3">Métricas</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {METRICAS_RELATORIO.map(([chave, rotulo]) => (
            <label key={chave} className="flex items-center gap-1">
              <input
                type="checkbox" name="metricas" value={chave}
                checked={metricas.has(chave)} onChange={() => alternar(metricas, setMetricas, chave)}
              />
              {rotulo}
            </label>
          ))}
        </div>

        <div className="label mt-3">Campanhas</div>
        {!campanhas.length && <p className="text-xs text-faint">Nenhuma campanha coletada ainda.</p>}
        <div className="flex flex-col gap-1 text-sm">
          {campanhas.map((k) => (
            <label key={k.campanha_id} className="flex items-center gap-2">
              <input
                type="checkbox" name="campanhas" value={k.campanha_id}
                checked={marcadas.has(k.campanha_id)} onChange={() => alternar(marcadas, setMarcadas, k.campanha_id)}
              />
              {k.nome} <span className="text-xs text-faint">{k.status}</span>
            </label>
          ))}
        </div>
      </div>
    </form>
  );
}
