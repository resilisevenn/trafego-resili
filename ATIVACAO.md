# Ativação — do código pronto ao dashboard no ar

Roteiro para quando o Supabase do Carteira voltar. Siga na ordem: cada passo
depende do anterior. Nenhum valor de credencial vai neste arquivo, só onde
cada um mora.

## 1. Banco — projeto NOVO do Supabase (`resili-interno`)

O projeto antigo do Carteira ficou preso em "pausado" (09/10/2026). O banco passa
para um projeto novo, compartilhado pelo **Carteira** e pelo **tráfego**.

1. **Criar o projeto** `resili-interno`, região **South America (São Paulo)**.
   Guardar a senha do banco no cofre de senhas.
2. **Criar o seu usuário antes de tudo:** Authentication → Users → Add user,
   `contato@resilisevenn.com.br`, com *Auto Confirm*. A Fase 0 dá o papel admin a
   esse e-mail; se o usuário não existir ainda, ninguém vira admin.
3. **Gerar o SQL único:** `bash scripts/montar_sql_projeto_novo.sh` → `saida/projeto_novo.sql`
   (Carteira 0001–0007 + tráfego 0001–0002, nessa ordem, numa transação).
4. **SQL Editor:** colar e rodar `saida/projeto_novo.sql`. Se der erro, nada fica pela metade.
5. **Settings → API → Exposed schemas:** adicionar `trafego`.
6. **Dados do Carteira:** nada a migrar (ver abaixo).
7. **Apontar o Carteira para o projeto novo:** trocar `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env.local` dele e na Vercel dele.

Conferência rápida no SQL Editor:

```sql
select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id;  -- você, admin
select count(*) from trafego.contas_anuncio;                                           -- 0, ainda sem coleta
```

Testado num PostgreSQL local, do banco vazio ao fim, inclusive a Fase 0 (o gestor
lê zero linhas do Carteira e não se promove a admin):
`bash supabase/teste-local/projeto_novo.sh supabase/teste-local/teste_fase0.sql`.

### Dados do projeto antigo

Não migrados (decisão de 09/10/2026): o Carteira ainda estava em desenvolvimento,
sem cadastro real. O projeto novo nasce limpo. Usuários são recriados em
Authentication e recebem o papel em `public.user_roles`.

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
4. O cron já está em `vercel.json`: todo dia às 09h UTC (06h de Brasília). O plano
   gratuito da Vercel só permite 1 execução por dia. Durante o dia, o botão
   **Atualizar** do dashboard coleta só a clínica na tela (trava de 5 minutos).

## 3. Primeira coleta (sem esperar o cron)

No terminal, com o `CRON_SECRET` na variável `$s`:

```powershell
curl.exe -H "Authorization: Bearer $s" https://trafego.resilisevenn.pro/api/cron/sync
```

A resposta lista cada conta com `ok (N linhas)` ou o erro.

## 4. Configuração no dashboard (logado como admin)

Em **Configuração**:
1. Criar os clientes.
2. Ligar cada conta a um cliente e definir verba, aviso de saldo (em dias) e meta de CPL.
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

### Grupos de WhatsApp — qual cliente vai para qual grupo

Fluxo no n8n: **"Tráfego — Relatório de Segunda"** (id `6U94jqqGPCyxwMnp`).
O destino é escolhido pelo `cliente_id` no Body do nó **"Enviar no grupo (UazAPI)"**
(o envio de segunda). Cliente que não está na lista do grupo Jackson cai no grupo [R7].
O caminho de teste (**"Teste — Enviar no grupo"**) manda SEMPRE para o grupo Jackson,
qualquer que seja o cliente filtrado: teste nunca chega ao [R7]. Os dois grupos usam a mesma instância
UazAPI (credencial "Uazapi Jackson Resili"); o número dela precisa estar no grupo.

| Grupo | ID | Clientes |
|---|---|---|
| Métricas Tráfego - Jackson | `120363412070605530@g.us` | Resili Sevenn (`ac862ac0-39f4-473c-b241-847d255672cc`), Dr Arlan Marques (`16d3d1aa-7ce4-4da5-bfc6-f306bb2f2e74`) |
| Métricas Tráfego [R7] | `120363431628754765@g.us` | Todos os outros (padrão): Dr Anderson Esp. Santo, Dra Isadora Staciarini, Dra. Gabrielle Leão, RVF Odontologia, Santa Podóloga |

O fluxo **"Tráfego — Alerta de Saldo"** (id `t5DDUeS0DEvoxS0h`, diário 07h) segue a
mesma regra, no nó "Enviar no grupo (UazAPI)". Lá a escolha é pelo NOME do cliente
(`alertas_saldo_pendentes()` não devolve `cliente_id`): renomear o cliente exige
ajustar a lista. Chamar a função marca o aviso do dia como enviado: rodar o fluxo
na mão consome o aviso daquele dia.

**Número reserva e token que muda (13/10/2026).** Reconectar o WhatsApp no Clinic 360
APAGA a instância na UazAPI e cria outra: o `instance_token` muda a cada reconexão
(`whatsapp-connect/index.ts`). Por isso, em todo nó de envio dos dois fluxos:

- Se o principal ("Uazapi Jackson Resili") falhar, a mesma mensagem sai pelo número
  da clínica resilisevenn (credencial "Uazapi Resili Reserva"), que está nos dois grupos.
- Na mesma execução, um aviso único vai ao grupo Jackson pelo reserva, pedindo para
  atualizar a credencial.
- Ao reconectar qualquer um dos dois números: copiar o `instance_token` novo da linha em
  `whatsapp_connections` (Supabase do Clinic 360) para a credencial correspondente no n8n.
- Pendente, se a reconexão for frequente: o Clinic 360 expor um envio por ID da conexão
  (que não muda), para o n8n não guardar token nenhum.

Cliente novo entra no [R7] sozinho. Para mandar ao grupo Jackson, acrescentar o
`cliente_id` dele (tabela `trafego.clientes`) à lista do nó de segunda e atualizar esta tabela.

### Alerta de saldo — gatilho: diário, 07h (depois da coleta das 06h)

1. **HTTP Request** `POST {SUPABASE_URL}/rest/v1/rpc/alertas_saldo_pendentes`
   (mesmos headers). Volta só os avisos **novos** do dia.
2. Para cada item, o mesmo envio pela UazAPI com `{{ $json.mensagem }}`.

A função marca o aviso como enviado no momento da chamada. Se o envio falhar
depois, ligue um caminho de erro no n8n (ex.: mensagem para você), porque o
aviso daquele dia não volta sozinho.

**Teste da Fase 5:** pôr o aviso em 30 dias numa conta com teto de gastos e rodar o
fluxo duas vezes: deve chegar um único aviso.

## 6. Validação dos números (cada fase)

Comparar 3 campanhas com o painel da plataforma. Diferença acima de 1% precisa
de explicação (fuso, atribuição ou janela) antes de seguir.

Pendências abertas (detalhe no BRIEFING, seção 7):
- Tipos de ação da Meta para "lead" e "conversa": conferir numa conta de cliente com leads.
- Saldo pré-pago da Meta: `funding_source_details` é negado com "Ver desempenho".
- Saldo do Google: conferir "limite − gasto" com o painel de faturamento.
