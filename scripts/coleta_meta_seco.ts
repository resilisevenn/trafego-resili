// Coleta da Meta "a seco": chama a API como a rota de cron faria e imprime o
// que SERIA gravado, sem tocar no banco. Para validar números contra o
// Gerenciador antes de o schema existir no Supabase.
//
//   npm run coleta:meta:seco
//
// Lê META_SYSTEM_USER_TOKEN do ambiente. Não imprime o token.

import { janela } from '../src/lib/coleta/datas';
import { buscarInsights, listarContas, paraMetrica, paraSaldo } from '../src/lib/coleta/meta';

async function main() {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_TOKEN ausente');

  for (const conta of await listarContas(token)) {
    const periodo = janela(conta.timezone_name);
    console.log(`\n▶ ${conta.name} (act_${conta.account_id}) ${periodo.since} → ${periodo.until}`);
    console.log('  saldo:', JSON.stringify({ ...paraSaldo(conta), bruto: undefined }));
    const linhas = (await buscarInsights(conta.account_id, token, periodo)).map(paraMetrica);
    for (const m of linhas) {
      const { bruto, ...resto } = m;
      void bruto;
      console.log('  ', JSON.stringify(resto));
    }
    console.log(`  ${linhas.length} linhas`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
