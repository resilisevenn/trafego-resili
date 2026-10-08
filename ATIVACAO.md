# Ativação — do código pronto ao dashboard no ar

Roteiro para quando o Supabase do Carteira voltar. Siga na ordem: cada passo
depende do anterior. Nenhum valor de credencial vai neste arquivo, só onde
cada um mora.

## 1. Banco (SQL Editor do Supabase do Carteira)

1. **Fase 0:** aplicar `carteira-clientes/supabase/migrations/0007_papeis.sql`.
   Depois, revisar os usuários atuais um a um (instruções no fim do arquivo).
2. Aplicar `supabase/migrations/0001_schema_trafego.sql`.
3. Aplicar `supabase/migrations/0002_funcoes_relatorio_alerta.sql`.
4. **Settings → API → Exposed schemas:** adicionar `trafego`.

Conferência rápida no SQL Editor:

```sql
select role from public.user_roles;            -- você aparece como admin
select count(*) from trafego.contas_anuncio;  -- 0, ainda sem coleta
```

As migrations já foram testadas num PostgreSQL local:
`bash supabase/teste-local/rodar.sh supabase/teste-local/teste_0002.sql`.

## 2. Vercel

1. Criar o projeto a partir do repositório `resilisevenn/trafego-resili`.
2. Variáveis de ambiente (nomes em `.env.example`):

| Variável | De onde vem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Supabase do Carteira → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | mesmo lugar. **Só** nesta variável, nunca no front |
| `CRON_SECRET` | gerar uma senha longa aleatória |
| `META_SYSTEM_USER_TOKEN` | o token do `dashboard-trafego` (o que está no cofre de senhas) |
| `GOOGLE_ADS_*` | os mesmos valores do `~/google-ads.yaml` |

3. Domínio: `trafego.resilisevenn.pro`.
4. O cron já está em `vercel.json`: todo dia às 09h UTC (06h de Brasília).

## 3. Primeira coleta (sem esperar o cron)

No terminal, com o `CRON_SECRET` na variável `$s`:

```powershell
curl.exe -H "Authorization: Bearer $s" https://trafego.resilisevenn.pro/api/cron/sync
```

A resposta lista cada conta com `ok (N linhas)` ou o erro.

## 4. Configuração no dashboard (logado como admin)

Em **Configuração**:
1. Criar os clientes.
2. Ligar cada conta a um cliente e definir o limite de alerta de saldo.
3. Gestores: criar o usuário no Supabase (Authentication → Add user, Auto Confirm),
   inserir em `public.user_roles` com papel `gestor`, e marcar as contas dele.
4. Relatório: escolher campanhas e métricas por conta.

**Teste obrigatório da Fase 3:** logar como o gestor e confirmar que só aparecem
as contas dele.

## 5. n8n (`n8n.resilisevenn.pro`)

Credenciais do n8n: a URL do Supabase, a `service_role` e o token da instância
UazAPI. Ficam nas credenciais do n8n, não nos nós.

### Relatório de segunda — gatilho: segunda, 08h, America/Sao_Paulo

1. **HTTP Request** `POST {SUPABASE_URL}/rest/v1/rpc/relatorio_semanal`
   - Headers: `apikey` e `Authorization: Bearer` com a service_role;
     `Content-Profile: trafego`; `Content-Type: application/json`
   - Body: `{}` (o padrão é hoje em Brasília: cobre os 7 dias anteriores)
   - Volta uma lista `[{ cliente_id, cliente, mensagem }]`, uma por cliente.
2. **Para cada item**, **HTTP Request** `POST {UAZAPI_URL}/send/text`
   - Header `token`: token da instância
   - Body: `{ "number": "<ID do grupo interno>@g.us", "text": "{{ $json.mensagem }}" }`
   - Mesmo contrato do `send-whatsapp-group` do Clinic 360.
   - Espaçar os envios em alguns segundos.

### Alerta de saldo — gatilho: diário, 07h (depois da coleta das 06h)

1. **HTTP Request** `POST {SUPABASE_URL}/rest/v1/rpc/alertas_saldo_pendentes`
   (mesmos headers). Volta só os avisos **novos** do dia.
2. Para cada item, o mesmo envio pela UazAPI com `{{ $json.mensagem }}`.

A função marca o aviso como enviado no momento da chamada. Se o envio falhar
depois, ligue um caminho de erro no n8n (ex.: mensagem para você), porque o
aviso daquele dia não volta sozinho.

**Teste da Fase 5:** pôr um limite alto numa conta e rodar o fluxo duas vezes:
deve chegar um único aviso.

## 6. Validação dos números (cada fase)

Comparar 3 campanhas com o painel da plataforma. Diferença acima de 1% precisa
de explicação (fuso, atribuição ou janela) antes de seguir.

Pendências abertas (detalhe no BRIEFING, seção 7):
- Tipos de ação da Meta para "lead" e "conversa": conferir numa conta de cliente com leads.
- Saldo pré-pago da Meta: `funding_source_details` é negado com "Ver desempenho".
- Saldo do Google: conferir "limite − gasto" com o painel de faturamento.
