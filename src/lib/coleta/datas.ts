// Datas da coleta, sempre no fuso da CONTA (BRIEFING, seção 6): a plataforma
// fecha o dia no fuso dela, e é assim que o Gerenciador mostra os números.

// Quantos dias para trás reprocessar a cada execução: as plataformas revisam
// números retroativamente, e o upsert pela PK evita duplicar.
export const JANELA_DIAS = 7;

// "Hoje" no fuso da conta, como AAAA-MM-DD. en-CA formata já nesse padrão.
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

export function janela(fuso: string, agora = new Date()): { since: string; until: string } {
  const until = hojeNoFuso(fuso, agora);
  const d = new Date(`${until}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - JANELA_DIAS);
  return { since: d.toISOString().slice(0, 10), until };
}
