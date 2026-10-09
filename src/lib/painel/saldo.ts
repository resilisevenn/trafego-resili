// Descrição da situação do saldo de uma conta, igual em todas as telas
// (Configuração, Visão geral, card da conta). Parte de saldo_conta.fonte.
//
//   Boleto/Pix       → crédito disponível (o que importa: quando acaba)
//   Cartão com teto  → quanto do limite de gastos já foi usado
//   Cartão sem teto  → não há saldo; só param se o cartão for recusado

import { fmtMoeda } from './formato';

export type InfoSaldo = {
  fonte: string | null;
  saldo: number | null;
  teto: number | null;
};

export type Situacao = {
  tipo: 'boleto' | 'teto' | 'sem_teto' | 'desconhecido';
  rotulo: string; // curto: "Boleto/Pix", "Teto de gastos", "Cartão sem teto"
  detalhe: string; // "crédito R$ 320,00", "R$ 1.200,00 · 25% usado"
  alertaAplica: boolean; // faz sentido configurar aviso de saldo?
};

export function situacaoSaldo(s: InfoSaldo, plataforma: string): Situacao {
  switch (s.fonte) {
    case 'credito_pre_pago':
      return { tipo: 'boleto', rotulo: 'Boleto/Pix', detalhe: `crédito ${fmtMoeda(s.saldo)}`, alertaAplica: true };
    case 'pre_pago_sem_permissao':
      return { tipo: 'boleto', rotulo: 'Boleto/Pix', detalhe: 'sem permissão para ler o crédito', alertaAplica: true };
    case 'pre_pago_texto_desconhecido':
      return { tipo: 'boleto', rotulo: 'Boleto/Pix', detalhe: 'crédito não reconhecido', alertaAplica: true };
    case 'spend_cap_menos_gasto':
    case 'account_budget': {
      const usado = s.teto && s.saldo != null ? Math.round(((s.teto - s.saldo) / s.teto) * 100) : null;
      return {
        tipo: 'teto',
        rotulo: s.fonte === 'account_budget' ? 'Orçamento da conta' : 'Teto de gastos',
        detalhe: `${fmtMoeda(s.teto)}${usado != null ? ` · ${usado}% usado` : ''}`,
        alertaAplica: true,
      };
    }
    case 'sem_limite':
      return {
        tipo: 'sem_teto',
        rotulo: plataforma === 'google' ? 'Orçamento sem limite' : 'Cartão sem teto',
        detalhe: 'só para se o pagamento falhar',
        alertaAplica: false,
      };
    case 'sem_account_budget':
      return { tipo: 'sem_teto', rotulo: 'Sem orçamento de conta', detalhe: 'sem saldo pela API', alertaAplica: false };
    default:
      return { tipo: 'desconhecido', rotulo: 'Sem coleta de saldo', detalhe: '', alertaAplica: true };
  }
}
