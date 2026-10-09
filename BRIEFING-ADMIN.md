# Brief — Página de Admin do Dashboard de Tráfego

**Estado:** decidido em 09/10/2026; etapa 1 (usuários e senha) em construção.
**URL:** `trafego.resilisevenn.pro/admin` · **Quem acessa:** só `admin`.

## 1. O problema

Hoje, tudo o que não é métrica exige sair do dashboard:

- **Usuário novo:** criar no painel do Supabase e depois inserir o papel em
  `public.user_roles` à mão.
- **Senha esquecida:** não há como recuperar; o login só aceita e-mail e senha.
- **Grupo de WhatsApp por cliente:** fica numa lista dentro do nó do n8n e no
  ATIVACAO.md (seção 5). Cliente novo exige mexer no n8n.
- **Saúde da operação:** saber se a coleta das 06h rodou exige consultar `sync_log`.

## 2. A base de usuários é compartilhada com o Carteira

O Carteira e o tráfego estão no mesmo projeto Supabase (`resili-interno`, confirmado
em 09/10/2026). Os usuários do Supabase Auth e `public.user_roles` são os mesmos.
Daí as regras (decididas em 09/10/2026):

- **A tela não cria admin.** Admin vê o Carteira inteiro (contrato, LTV); continua
  sendo dado à mão no banco.
- **A tela não exclui usuário.** Excluir apagaria o login nos dois sistemas. Ela
  **desativa**: tira o papel; o login existe, mas cai em "sem acesso".
- **Admins aparecem na lista só para leitura.** Nenhuma ação da tela mexe em admin.

## 3. Sem e-mail: senha provisória

O e-mail padrão do Supabase só entrega para membros da organização no Supabase e
tem limite baixo; SMTP próprio (Resend etc.) foi descartado em 09/10/2026. Por isso:

| Situação | Como fica |
|---|---|
| **Gestor novo** | Admin digita nome e e-mail no `/admin`; a tela cria o usuário e mostra uma **senha provisória** uma única vez. O admin manda pelo WhatsApp |
| **Primeiro acesso** | Entra com a provisória e é **obrigado a trocar** antes de ver qualquer tela |
| **Esqueceu a senha** | Avisa o admin, que clica em **"Gerar nova senha provisória"** |
| **Trocar a própria senha** | "Minha senha" no cabeçalho, logado |

A marca "precisa trocar a senha" fica em `app_metadata.trocar_senha` do usuário
(só a service_role escreve ali; `user_metadata` o próprio usuário edita). Se um
dia a equipe crescer, liga-se um SMTP e acrescenta-se o convite por e-mail sem
refazer nada.

## 4. Etapas

### Etapa 1 — Usuários e senha (em construção)

| Função | Como funciona |
|---|---|
| **Listar** | Nome, e-mail, papel, último acesso, status (ativo / aguardando 1º acesso / desativado) |
| **Criar gestor** | Nome + e-mail → senha provisória na tela, papel `gestor`, nenhuma conta liberada |
| **Contas que vê** | O antigo "Acesso dos gestores" da Configuração, agora na ficha do gestor |
| **Nova senha provisória** | Para quem esqueceu |
| **Desativar / reativar** | Tira e devolve o papel `gestor`. As contas liberadas ficam guardadas |
| **Trocar senha** | Obrigatória no 1º acesso; voluntária em "Minha senha" |

### Etapa 2 — Grupos de WhatsApp

- Cadastro dos grupos (nome + ID `@g.us`) e, em cada cliente, qual grupo recebe o
  relatório e os alertas. O n8n passa a ler o grupo do banco.

### Etapa 3 — Saúde do sistema

- Última coleta por plataforma, com erro quando houver (`sync_log`).
- Últimos alertas de saldo enviados (`alerta_saldo`).

## 5. O que fica de fora

- Criar admin, excluir usuário (seção 2).
- Editar credenciais (Meta, Google, UazAPI): continuam na Vercel e no n8n.
- Ativar/desativar os fluxos do n8n pela tela.

## 6. Como fica tecnicamente

- As ações usam a **API de admin do Supabase Auth** (service_role), só no servidor,
  depois de conferir `is_admin()` com a sessão de quem clicou.
- O papel continua em `public.user_roles`, gravado só pelo servidor.
- **Rotas:** `/admin` (só admin, no menu) e `/trocar-senha` (qualquer logado).
- **Banco:** a etapa 1 não pede migration. A etapa 2 pede tabela de grupos.
