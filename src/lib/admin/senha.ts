// Senha provisória do gestor (BRIEFING-ADMIN, seção 3). Vai por WhatsApp e é
// digitada uma vez: sem caracteres que se confundem (0/O, 1/l/I) e em blocos.
// Aleatoriedade do crypto, não Math.random: é uma credencial.

import { randomInt } from 'node:crypto';

const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITOS = '23456789';

const bloco = (alfabeto: string, n: number) =>
  Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join('');

// "kfm4-pq7x-ht92": 12 caracteres de 31 símbolos (~59 bits). Basta para algo que
// vale até o primeiro acesso, quando a troca é obrigatória.
export function gerarSenhaProvisoria(): string {
  const todos = LETRAS + DIGITOS;
  return [bloco(todos, 4), bloco(todos, 4), bloco(todos, 4)].join('-');
}

// Regra da senha que o próprio usuário escolhe. Devolve a mensagem de erro ou null.
export function validarSenhaNova(senha: string, confirmacao: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha !== confirmacao) return 'As duas senhas não são iguais.';
  return null;
}
