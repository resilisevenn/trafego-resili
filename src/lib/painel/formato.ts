// Números no padrão brasileiro (R$ 1.234,56). Nulo vira "—": sem dado não é zero.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dec1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const SEM_DADO = '—';

export const fmtMoeda = (v: number | null) => (v == null ? SEM_DADO : brl.format(v));
export const fmtInteiro = (v: number | null) => (v == null ? SEM_DADO : inteiro.format(v));
export const fmtDecimal = (v: number | null) => (v == null ? SEM_DADO : dec2.format(v));
export const fmtPct = (v: number | null) => (v == null ? SEM_DADO : `${dec2.format(v)}%`);
// Leads do Google podem ser fracionados (atribuição): mostra 1 casa só se houver.
export const fmtContagem = (v: number | null) => (v == null ? SEM_DADO : dec1.format(v));

export function fmtData(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// Lê valor em reais digitado pelo admin. Aceita "1.234,56", "1234,56", "1234.56"
// e "1234". Ponto seguido de 1 ou 2 dígitos no fim é decimal ("1500.50"); senão
// é separador de milhar ("1.500"). Sem isso, "1500.50" virava R$ 150.050,00.
// Vazio → null. Inválido → NaN (quem chama decide a mensagem).
export function lerReais(texto: string): number | null {
  const v = texto.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (v === '') return null;
  let normal: string;
  if (v.includes(',')) normal = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(v)) normal = v;
  else normal = v.replace(/\./g, '');
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}
