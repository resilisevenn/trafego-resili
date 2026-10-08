// Coleta do Google "a seco": chama a API como a rota de cron faria e imprime o
// que SERIA gravado, sem tocar no banco.
//
//   npm run coleta:google:seco
//
// Credenciais: variáveis GOOGLE_ADS_* ou, se faltarem, ~/google-ads.yaml (o
// arquivo que scripts/configurar_credenciais.py gera). Nada sensível é impresso.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { janela } from '../src/lib/coleta/datas';
import * as google from '../src/lib/coleta/google';

function credDoYaml(): google.CredGoogle {
  const linhas = readFileSync(join(homedir(), 'google-ads.yaml'), 'utf8').split(/\r?\n/);
  const v = Object.fromEntries(
    linhas.map((l) => l.match(/^(\w+):\s*(.+)$/)).filter(Boolean).map((m) => [m![1], m![2].trim()]),
  );
  return {
    developerToken: v.developer_token, clientId: v.client_id, clientSecret: v.client_secret,
    refreshToken: v.refresh_token, loginCustomerId: String(v.login_customer_id).replace(/-/g, ''),
  };
}

async function main() {
  const cred = google.credDoAmbiente() ?? credDoYaml();
  const acesso = await google.tokenDeAcesso(cred);

  for (const { customerClient: c } of await google.listarContas(cred, acesso)) {
    const periodo = janela(c.timeZone);
    console.log(`\n▶ ${c.descriptiveName} (${c.id}, ${c.status}) ${periodo.since} → ${periodo.until}`);
    try {
      const [linhas, orcamentos] = await Promise.all([
        google.buscarCampanhas(cred, acesso, String(c.id), periodo),
        google.buscarOrcamentos(cred, acesso, String(c.id)),
      ]);
      const { bruto: _o, ...saldo } = google.paraSaldo(orcamentos);
      void _o;
      console.log('  saldo:', JSON.stringify(saldo));
      for (const l of linhas) {
        const { bruto, ...m } = google.paraMetrica(l);
        void bruto;
        console.log(`   ${l.campaign.name} |`, JSON.stringify(m));
      }
      console.log(`  ${linhas.length} linhas`);
    } catch (e) {
      console.log('  ERRO:', (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
