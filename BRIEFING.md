# Briefing — Dashboard de Tráfego Resili Sevenn

**Criado em:** 2026-10-08 · **Dono:** Jackson Marques
**URL:** `trafego.resilisevenn.pro` · **Deploy:** Vercel · **Banco:** Supabase do projeto Carteira de Clientes
**Estado (08/10/2026):** código das Fases 1 a 5 pronto e testado; falta ativar (Supabase, Vercel, n8n).
Ver o checklist na seção 11 e o passo a passo em `ATIVACAO.md`.

---

## 1. O problema

Hoje o relatório de tráfego é manual: abrir o Gerenciador da Meta e o Google Ads,
copiar as métricas para o bloco de notas, organizar e mandar no WhatsApp. Toda
semana, para cada cliente.

Este projeto resolve isso com:

1. **Coleta automática** das métricas de Meta Ads e Google Ads, todo dia.
2. **Dashboard interno** para ver os números organizados, trocando de cliente e de
   plataforma num seletor.
3. **Relatório de segunda-feira** enviado pelo n8n ao **grupo interno** de WhatsApp.
   Alguém da equipe revisa e encaminha ao cliente.
4. **Saldo das contas de anúncio** no dashboard e **alerta no WhatsApp** quando o
   saldo estiver acabando.

**Fora do escopo agora:** o cliente final ver o dashboard. Quando isso vier (v2), o
caminho é alimentar o "Dashboard ROI" do plano Premium do Sevenn Clinic 360. Este app
não será aberto para fora.

## 2. Quem usa

| Papel | Quem | O que vê |
|---|---|---|
| `admin` | Jackson | Todas as contas, todos os clientes. Também é o único que vê o Carteira |
| `gestor` | Gestor(es) de tráfego | **Só** as contas de anúncio ligadas a ele em `trafego.acesso_conta` |

São 3 pessoas no início. Os usuários são criados à mão no painel do Supabase, como já
acontece no Carteira.

**Regra inegociável:** o gestor não pode ler nada do Carteira (contrato, LTV,
inadimplência). A separação é feita no **banco**, por RLS. Esconder na tela não basta.

## 3. Arquitetura

```
Meta Marketing API ─┐
                    ├─► coleta diária (Vercel Cron) ─► Supabase, schema `trafego`
Google Ads API ─────┘          (métricas + saldo)              │
                                        ┌──────────────────────┼─────────────────────┐
                                 Dashboard Next.js     n8n segunda 8h        n8n alerta de saldo
                                 (este repositório)   resumo → UazAPI       saldo < limite → UazAPI
                                                      → grupo interno        → grupo interno
```

- **Stack:** Next.js + Supabase (`@supabase/ssr`) + Tailwind, o mesmo padrão do Carteira.
- **O dashboard lê do banco, nunca da API ao vivo.** Assim abre rápido, tem histórico
  e não estoura o limite de chamadas.
- **A coleta roda em rota protegida** (`/api/cron/sync`), chamada pelo Vercel Cron com
  um segredo no header. Ela grava com a `service_role`, que só existe no servidor.
- **O n8n** (`n8n.resilisevenn.pro`) lê o banco, monta a mensagem e envia pela UazAPI.
  A UazAPI já está ativa. Confirme no código do Clinic 360 qual endpoint envia para grupo.

## 4. Banco — schema `trafego` no Supabase do Carteira

> **Pré-requisito:** a Fase 0 (no repositório do Carteira) precisa estar aplicada antes
> de qualquer gestor ganhar login. Ver `TAREFA-fase0-papeis.md` no Carteira.

**Migrations aplicadas à mão no SQL Editor**, como no Carteira e no Clinic 360. Nunca
rodar `supabase db push`. Cada migration leva um cabeçalho comentado dizendo o quê e o porquê.

| Tabela | Conteúdo |
|---|---|
| `trafego.clientes` | Cliente da agência no tráfego (nome, ativo). Não referencia `public.clientes` do Carteira, para o gestor não depender de tabela que não pode ler |
| `trafego.contas_anuncio` | `plataforma` (meta/google), `conta_id` nativo, nome, `cliente_id`, `limite_alerta_saldo`, `verba_mensal`, `cpl_meta`, `ativa` |
| `trafego.acesso_conta` | `user_id` × `conta_anuncio_id`: quais contas cada gestor vê |
| `trafego.campanhas` | Estrutura: campanha, conjunto/grupo, anúncio (ids e nomes nativos), status |
| `trafego.metricas_diarias` | Uma linha por **campanha por dia**, com unique `(conta, campanha_id, data)` e upsert |
| `trafego.saldo_conta` | Foto diária do saldo: `conta`, `data`, `saldo`, `tipo_pagamento`, `fonte` (de qual campo veio), `bruto` (jsonb da resposta) |
| `trafego.sync_log` | Cada execução da coleta: início, fim, status, linhas, erro |
| `trafego.relatorio_config` | Por conta: quais campanhas entram no relatório de segunda e quais métricas |
| `trafego.alerta_saldo` | Avisos de saldo enviados. A PK `(conta, data)` garante no máximo um por dia |

**Colunas de `metricas_diarias`:** `investimento`, `impressoes`, `alcance`,
`frequencia`, `cliques`, `ctr`, `cpc`, `cpm`, `leads`, `conversas`, `parcela_impressoes`
(só Google, pesquisa), mais `bruto jsonb`
com a resposta original. O `bruto` permite criar métricas novas depois, sem coletar
tudo de novo. As métricas extras que o Jackson vai passar entram como coluna nova.

> Referência de modelagem: o `FactPerformance` do repositório
> `github.com/jfeernandezo/nexus.ai` (uma linha por anúncio/dia, métricas em colunas).
> Use só como molde. O resto daquele projeto não serve aqui: a coleta lá está como TODO,
> e a infraestrutura (NestJS, Redis, filas) é pesada demais.

**Granularidade:** comece por campanha/dia. Desça para anúncio/dia só se o relatório pedir.

**RLS do schema `trafego`:**

- `admin` (via `public.is_admin()`) lê e escreve tudo.
- `gestor` lê **só** as linhas cuja conta está em `acesso_conta` com o `user_id` dele.
  Faça isso por uma função `SECURITY DEFINER` (`trafego.minhas_contas()`), não por
  subquery solta na policy.
- Ninguém escreve pelo app nas tabelas de dados. Só a coleta escreve, via `service_role`.
- Lembre do `GRANT` explícito nas tabelas e no schema. O Carteira já tropeçou nisso
  (migrations 0005/0006).

## 5. Credenciais

**Nenhum token em tabela, em código ou em exemplo.** Tudo fica em variáveis de ambiente
da Vercel. O `.env.example` leva só o **nome** das variáveis, sem valor.

| Variável | O que é |
|---|---|
| `META_SYSTEM_USER_TOKEN` | Token do System User do Business Manager da agência (a agência tem acesso às contas pelo BM) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token da MCC (já aprovado) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ID da MCC |
| `GOOGLE_ADS_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` | OAuth da conta que acessa a MCC |
| `SUPABASE_SERVICE_ROLE_KEY` | Só no servidor, só para a coleta |
| `CRON_SECRET` | Protege a rota de coleta |

O Clinic 360 já tem `google-ads-auth` e `meta-credentials-test` em
`supabase/functions/`. Leia esses arquivos antes de escrever a autenticação.

## 6. Coleta

**Meta:** endpoint `/{act_id}/insights` com `level=campaign`, `time_increment=1`.
Campos: `spend`, `impressions`, `reach`, `frequency`, `clicks`, `ctr`, `cpc`, `cpm`,
`actions`. Leads e conversas saem de `actions`. Antes de fixar quais `action_type`
contam como "lead" e "conversa", confira nas contas reais. A escolha varia pelo
objetivo da campanha.

**Google:** GAQL sobre `campaign` com `segments.date`, `metrics.cost_micros`,
`impressions`, `clicks`, `ctr`, `average_cpc`, `conversions`. O Google **não tem
alcance nem frequência** no nível de campanha comum. Mostre "—" nesses campos e não invente.

**Janela:** a cada dia, reprocesse os **últimos 7 dias**, porque as plataformas
revisam os números retroativamente. O upsert pela unique evita linhas duplicadas.

**Fuso e moeda:** use o fuso e a moeda da conta, e grave a data no fuso da conta.

## 7. Saldo — validar primeiro

O saldo é a **primeira tarefa** da Fase 1, porque a forma de obter muda por tipo de pagamento:

| Plataforma | Caso | De onde pode vir |
|---|---|---|
| Meta | Pré-pago (Pix/boleto) | `funding_source_details`: às vezes só em texto ("Saldo disponível R$ X"), exigindo leitura do texto `[PENDENTE DE VALIDAÇÃO]` |
| Meta | Cartão | Não há saldo. Use `spend_cap − amount_spent` (limite de gastos da conta) |
| Google | Faturado pela MCC | `account_budget`: aprovado − gasto |
| Google | Pré-pago manual | Não se sabe se a API expõe o saldo `[PENDENTE DE VALIDAÇÃO]` |

**Passo 1:** escreva um script que só lê e imprima, para cada conta real, o que cada
campo devolve. Registre o resultado aqui antes de construir a tela.

**Plano B, se não houver saldo pela API:** alerta por **ritmo de gasto**. Calcule a
média diária dos últimos 7 dias, compare com o que resta do limite e avise quando a
projeção der menos de N dias.

### Resultado do Passo 1 — Google (08/10/2026, `scripts/teste_saldo.py google`)

A MCC devolveu **3 contas**. Todas têm `billing_setup` APPROVED e um `account_budget` APPROVED, sem data de fim.

| Conta | Customer ID | Limite aprovado | Gasto (`amount_served`) | Restante |
|---|---|---|---|---|
| Dr Arlan Marques | 6429133978 | R$ 25.380,74 | R$ 23.096,72 | R$ 2.284,02 |
| RVF Odontologia | 7682180017 | **INFINITE** | R$ 1.257,73 | — |
| Santa Podóloga | 3517701794 | R$ 1.600,00 | R$ 1.506,20 | R$ 93,80 |

- **Com limite:** saldo = `adjusted_spending_limit_micros − amount_served_micros`. Ainda falta
  confirmar que esse "restante" bate com o saldo mostrado no painel de faturamento, e se a conta é
  pré-paga ou faturada `[PENDENTE DE VALIDAÇÃO]`.
- **INFINITE (RVF):** não há saldo pela API. Usar o Plano B (ritmo de gasto) ou só monitorar o gasto.
- Os 5 clientes ativos não aparecem todos na MCC: faltam contas a vincular ou clientes sem Google Ads
  `[PENDENTE DE VALIDAÇÃO]`.

### Resultado do Passo 1 — Meta

Rodado em 08/10/2026 com o usuário do sistema `dashboard-trafego` (BM Resili Sevenn, app "Dashboard
Trafego Resili", permissão `ads_read`, conta com "Ver desempenho"). Só 1 conta compartilhada até agora:

| Conta | ID | `is_prepay_account` | `balance` | `amount_spent` | `spend_cap` | Limite − gasto |
|---|---|---|---|---|---|---|
| C.A - Resili Sevenn | act_678147093607200 | False | R$ 31,75 | R$ 31,73 | R$ 2.000,00 | R$ 1.968,27 |

- `funding_source_details` é **negado (#10)** com "Ver desempenho". Para as contas pré-pagas (Pix/boleto),
  o texto "Saldo disponível" depende desse campo. Liberar exige acesso financeiro ("Gerenciar contas de
  anúncios") `[PENDENTE DE VALIDAÇÃO]`: decidir se vale o risco, ou usar o Plano B nessas contas.
- Em conta não pré-paga, `balance` parece ser o valor **a cobrar**, não o crédito disponível. Conferir
  com o painel de pagamentos `[PENDENTE DE VALIDAÇÃO]`.
- Ainda falta testar uma conta **pré-paga** de cliente, que é o caso que importa.

**Acesso (decidido em 08/10/2026):** as contas dos clientes ficam em BMs separados, não no BM da
Resili. O caminho escolhido é cada BM de cliente atribuir a conta de anúncio ao **BM Resili Sevenn**
como **parceiro**. Assim o token é um só, do usuário do sistema do BM da Resili. Teste feito com o BM
"Jackson Marques", que compartilhou a conta "C.A - Resili Sevenn". Os BMs dos clientes ainda não
foram configurados.

## 8. Relatório de segunda (n8n)

- **Gatilho:** segunda, 8h (horário de Brasília).
- **Período:** os 7 dias anteriores, comparados com os 7 dias antes deles (variação %).
- **Conteúdo:** um bloco por cliente, só com as campanhas e métricas marcadas em
  `relatorio_config`, mais o saldo atual.
- **Destino:** o grupo interno de WhatsApp, via UazAPI. Uma mensagem por cliente, para
  facilitar o encaminhamento.
- **Formato:** texto do WhatsApp (`*negrito*`), números no padrão brasileiro
  (R$ 1.234,56), sem tabela.

Exemplo de forma, com números fictícios só para mostrar o layout:

```
*Dr(a). [CLIENTE] — Meta Ads*
_01/10 a 07/10 · vs. semana anterior_

💰 Investimento: R$ 0,00 (▲ 0%)
👁 Impressões: 0 · Alcance: 0 · Freq.: 0,00
🖱 Cliques: 0 · CTR 0,00% · CPC R$ 0,00
📊 CPM: R$ 0,00
🎯 Leads: 0 · Conversas: 0

💳 Saldo da conta: R$ 0,00
```

## 9. Alerta de saldo (n8n)

- **Quando roda:** diariamente, depois da coleta.
- **Regra:** dispara se `saldo < limite_alerta_saldo` da conta.
- **Envio:** grupo interno. **No máximo um aviso por conta por dia**, para não virar
  spam. Registre o último aviso enviado.

## 10. Dashboard

- Login pelo Supabase Auth (mesma base de usuários do Carteira). Entra quem tem papel
  em `public.user_roles`; sem papel, tela "sem acesso".
- **Menu:** Visão geral · Por conta · Configuração (só admin).
- **Visão geral (página inicial):** todas as contas que o usuário vê, ordenadas por
  quem precisa de ação. Investimento, leads e CPL dos últimos 7 dias com variação,
  saldo com **dias restantes**, **ritmo da verba do mês** e **alertas**.
- **Por conta:**
  - **Seletor:** cliente → plataforma (Meta / Google) → conta. Botão "← Visão geral".
  - **Período:** Hoje, Esta semana, Semana anterior, Últimos 7 e 30 dias, Este mês,
    Último mês, Este ano, Máximo, Personalizado. **Semana começa na segunda.**
    Comparação com o trecho equivalente anterior (esta semana até quinta × semana
    passada até quinta). "Máximo" não tem comparação.
  - **Cards:** 10 por plataforma (5 + 5), com variação. Meta: Investimento, Alcance,
    Frequência, Cliques, CTR, CPC, CPM, Leads, CPL, Conversas. Google: Investimento,
    Impressões, Cliques, CTR, CPC, CPM, Conversões, Custo por conversão, Taxa de
    conversão, Parcela de impressões.
  - **Card de saldo**, destacado quando estiver abaixo do limite.
  - **Gráficos separados** de investimento e de leads/conversões por dia (nunca eixo
    duplo), com Máx. ⇄ Média ao clicar.
  - **Tabela de campanhas** e **status da coleta** (de `sync_log`).
  - **Botão "Atualizar":** coleta na hora só a clínica na tela (Meta e Google), com
    trava de 5 minutos.
- **Configuração (só admin):** clientes; por conta, o cliente, o limite de alerta de
  saldo, a **verba mensal** e a **meta de CPL**; acesso de cada gestor; campanhas e
  métricas do relatório.
- **Coleta:** 1x por dia às 06h (Vercel Cron, plano gratuito) + botão "Atualizar".

**Alertas da visão geral** (limites em `src/lib/painel/saude.ts`, ajustáveis):

| Alerta | Regra inicial |
|---|---|
| Saldo | 🔴 abaixo do limite ou < 3 dias · 🟡 < 7 dias |
| Conta parou | 🔴 gasto zero ontem, numa conta que gastava ≥ R$ 5/dia |
| CPL disparou | 🟡 7 dias 30% acima das 4 semanas anteriores (≥ 3 leads) |
| Acima da meta | 🟡 CPL acima da meta do cliente |
| Fadiga (Meta) | 🟡 frequência da semana > 3 |
| Ritmo da verba | 🟡 projeção do mês > 110% ou < 80% da verba |
| Coleta | 🟡 erro ou sem coleta há mais de 26 h |

**Aproximação conhecida:** na Meta, alcance e frequência do período somam os
alcances diários (quem viu em dois dias conta duas vezes). O número exato exige
uma consulta extra por período `[PENDENTE DE DECISÃO]`.

## 11. Fases — checklist

Legenda: ✅ feito · 🟡 código pronto, falta ativar ou validar · ⬜ não começado

| Fase | Onde | Entrega | Pronto quando | Estado |
|---|---|---|---|---|
| **0** | Carteira | Papéis + RLS "só admin" | Um usuário `gestor` de teste loga e não lê nenhuma linha do Carteira | 🟡 `0007_papeis.sql` escrita, não aplicada |
| **1** | Aqui | Script de saldo, schema `trafego`, coleta Meta | 7 dias de métricas reais no banco batendo com o Gerenciador | 🟡 |
| **2** | n8n | Relatório de segunda | Uma segunda chega no grupo sem ninguém tocar | 🟡 função no banco pronta; fluxo n8n a montar |
| **3** | Aqui | Dashboard Meta + saldo + config | Os 3 usuários usam. O gestor vê só as contas dele | 🟡 |
| **4** | Aqui | Coleta Google pela MCC + aba Google | Números batem com o Google Ads | 🟡 |
| **5** | n8n | Alerta de saldo | Teste com limite alto dispara um único aviso | 🟡 função no banco pronta; fluxo n8n a montar |
| **6** | n8n + aqui | Alertas de anomalia no WhatsApp | Conta parada / CPL disparado chegam no grupo, 1x por dia | ⬜ hoje só no painel |
| **Depois** | — | Ver "Próximos" abaixo | — | ⬜ |

### Fase 1 — base e coleta
- [x] Teste de saldo Meta e Google (seção 7)
- [x] Schema `trafego` com RLS (`0001`), testado em PostgreSQL local
- [x] Coleta Meta e Google na rota `/api/cron/sync`, validada a seco com as APIs reais
- [x] Busca paginada (o Supabase corta em 1000 linhas)
- [ ] Supabase: aplicar Fase 0, `0001`, `0002` e expor o schema `trafego`
- [ ] Vercel: projeto, variáveis de ambiente, domínio
- [ ] Primeira coleta real e comparação de 3 campanhas com o Gerenciador (diferença < 1%)
- [ ] Conferir tipos de ação de lead/conversa numa conta de cliente com leads (seção 6)
- [ ] Conferir saldo do Google contra o painel de faturamento (seção 7)

### Fase 2 — relatório de segunda
- [x] `trafego.relatorio_semanal()`: uma mensagem por cliente, formato brasileiro, com CPL
- [ ] Fluxo n8n: segunda 08h → função → UazAPI para o grupo interno
- [ ] Uma segunda chegando sem ninguém tocar

### Fase 3 — dashboard
- [x] Login, visão geral, por conta, configuração, prévia local (`/previa`)
- [x] Períodos, cards por plataforma, CPL, gráficos, botão Atualizar
- [x] Dias de saldo, ritmo da verba, alertas de anomalia no painel
- [ ] Abrir no navegador com dados reais
- [ ] Criar os gestores e testar que cada um vê só as próprias contas

### Fase 4 — Google
- [x] Coleta pela MCC (só contas ativas), conversões, parcela de impressões
- [ ] Validar números contra o Google Ads

### Fase 5 — alerta de saldo
- [x] `trafego.alertas_saldo_pendentes()`: no máximo 1 aviso por conta por dia
- [ ] Fluxo n8n diário depois da coleta
- [ ] Teste com limite alto: chega um único aviso

### Fase 6 — alertas de anomalia no WhatsApp
- [ ] Levar para o banco as regras de `src/lib/painel/saude.ts` (conta parou, CPL
      disparou, fadiga, ritmo) e devolver só os alertas novos do dia, como no saldo
- [ ] Ajustar os limites com dados reais antes de ligar o envio
- [ ] Fluxo n8n diário depois da coleta

### Próximos (aprovados, sem data)
- [ ] Parcela de impressões perdida por orçamento × por classificação (Google)
- [ ] Anotações na linha do tempo ("subimos a verba", "criativo novo")
- [ ] Desempenho por anúncio/criativo (Meta): exige coleta por anúncio
- [ ] Funil lead → agendamento → venda: v2, via Sevenn Clinic 360 (Dashboard ROI)
- [ ] Métricas extras (o Jackson vai passar)

**Validação dos números:** em cada fase, compare 3 campanhas com o painel da
plataforma. Diferença acima de 1% precisa de explicação (fuso, atribuição ou janela)
antes de seguir.

## 12. Regras do projeto

- Trabalhar na `main`. Não criar branch.
- **Commit e push só com autorização do Jackson.**
- Nunca escrever credencial em arquivo, nem em exemplo.
- O repositório no GitHub vai ser criado pelo Jackson. Depois disso, conectar o remoto aqui.
- Decisão do porquê deste desenho: `C:\PROJETOS\organizacao\Decisions\2026-10-08-dashboard-trafego-supabase-compartilhado.md`.
