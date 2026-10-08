import { createClient } from '@supabase/supabase-js';

// Cliente com service_role, que ignora RLS. SÓ para a coleta, no servidor.
// Nunca importar em componente de cliente: a chave daria acesso total ao banco.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente');

  return createClient(url, chave, {
    db: { schema: 'trafego' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
