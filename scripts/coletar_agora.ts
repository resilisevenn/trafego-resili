// Roda a coleta REAL agora (a mesma função do cron), gravando no Supabase.
// Para a primeira carga e para testes locais, sem depender do servidor.
//
//   node --conditions=react-server --import tsx scripts/coletar_agora.ts
//   (ou: npm run coletar)
//
// Credenciais, sem nada impresso:
//   - Supabase: .env.local (URL + SUPABASE_SERVICE_ROLE_KEY)
//   - Meta: variável de ambiente META_SYSTEM_USER_TOKEN
//   - Google: variáveis GOOGLE_ADS_* ou, se faltarem, ~/google-ads.yaml
// --conditions=react-server: o módulo de coleta importa 'server-only', que fora
// do Next só aceita ser carregado nessa condição.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

process.loadEnvFile('.env.local');

const yaml = join(homedir(), 'google-ads.yaml');
if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && existsSync(yaml)) {
  const v = Object.fromEntries(
    readFileSync(yaml, 'utf8').split(/\r?\n/).map((l) => l.match(/^(\w+):\s*(.+)$/)).filter(Boolean).map((m) => [m![1], m![2].trim()]),
  );
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = v.developer_token;
  process.env.GOOGLE_ADS_CLIENT_ID = v.client_id;
  process.env.GOOGLE_ADS_CLIENT_SECRET = v.client_secret;
  process.env.GOOGLE_ADS_REFRESH_TOKEN = v.refresh_token;
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = String(v.login_customer_id);
}

// Função em vez de await solto: o tsx carrega o script como CommonJS.
async function main() {
  const { sincronizar } = await import('../src/lib/coleta/sincronizar');
  const inicio = Date.now();
  console.log(JSON.stringify(await sincronizar(), null, 2));
  console.log(`Concluído em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
