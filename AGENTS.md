# Ciliar

Leia `aicontext/README.md` e o guia do módulo antes de desenvolver.

- App Next.js único com pnpm; TypeScript estrito; rotas em `src/app`, regras em `src/features`,
  infraestrutura em `src/lib`, UI compartilhada em `src/components`.
- Base copiada do Opex. Preserve os componentes e bibliotecas existentes; não reescreva a UI.
- Tema escuro fixo, primária `#0B57C4` (azul do crm-marketing-campanhas), cores por tokens. Shadcn/Radix, Tailwind 4, lucide-react,
  sonner, date-fns e Framer Motion (respeitando movimento reduzido).
- Escopo atual: Integrações, Usuários, Perfis, Visualizar como, o Agente Opex (chat com
  ferramentas), a Plataforma (M0), Negócios + Agente Entrevistador (M1), o Espaço do negócio (M2),
  Clientes + Pedidos (M3) e Trabalhos (M4), por solicitação do usuário. Exceção ao tema fixo: o espaço do negócio
  e seu orçamento público usam a cor e o modo do negócio (`aicontext/modules/business-space.md`
  e `aicontext/modules/orders.md`).
- Auth.js nativo no Next, **somente Google** (sem e-mail/senha). Cadastro público com o perfil
  padrão da Plataforma, convite (pré-cadastro do e-mail) e vínculo automático por e-mail verificado.
  Aceite versionado dos termos/política é conferido no servidor. Toda API administrativa exige
  sessão válida e autorização Perfix no servidor, inclusive chamadas diretas.
- O CLI `pnpm user:create` (pré-autoriza um e-mail Google) é a única entrada de bootstrap do
  primeiro Administrador; não crie contas no startup.
- Nunca confunda o ator real com o alvo da simulação. Marcador explícito por requisição/aba;
  auditoria preserva o ator real. Preserve o histórico antigo do ator `local`. **Exceção (M1):** na
  simulação de usuário, as ações de Negócio agem sobre o alvo como dono (`businessOwnerOf`), com a
  auditoria no ator real; ver `aicontext/modules/businesses.md`.
- Alterações de autoridade exigem replica set, transação, fence compartilhado e versionamento.
  Nunca reconfigure o MongoDB compartilhado automaticamente.
- Banco exclusivo `ciliar`; nunca use o banco do Opex nem copie seu `.env` ou seus dados.
- Segredos de integração são cifrados com AES-256-GCM e somente escrita; nunca devolva valores
  privados ao navegador, logs ou auditoria. Configuração pela tela `/integracoes`.
- Cliente usa axios central (`baseURL: /api`) por hooks TanStack Query; validação com Zod.
- Preserve auditoria e logging Pino. Texto e mensagens em pt-BR.
- Tempo real: Pusher/Soketi; autorize canais conhecidos por sessão e permissões efetivas.
  Status/debug transmitem só invalidações; conteúdo é relido pela API autorizada.
- Crons usam agendador interno em processo Node persistente; sem Redis, filas ou workers.
- Toda alteração: implementar → ferramentas do agente → documentar em `aicontext/` → testes Vitest
  em `__tests__/`.
- **Ferramentas do Agente Opex são obrigatórias.** Ao criar ou alterar uma funcionalidade, crie ou
  atualize as ferramentas correspondentes para o agente executar o mesmo que a tela/API:
  1. registre no catálogo puro `src/features/opex-agent/tool-catalog.ts` (nome `snake_case`, grupo,
     rótulo, descrição para o modelo, risco e as permissões Perfix exigidas); grupo novo entra em
     `OPEX_TOOL_GROUPS`/`OPEX_TOOL_GROUP_LABELS` e em `components/tool-icons.ts`. O catálogo é o
     que aparece na seleção de ferramentas da configuração (Integrações › Provedores de IA › Agente
     Opex), então toda ferramenta fica registrada lá automaticamente;
  2. implemente em `server/tools/<grupo>.ts` com `defineTool(nome, { input, execute })` e inclua no
     `registry.ts`; chame o serviço/comando real com `context.access` (nunca HTTP), e use `authorize`
     para permissões que dependem da entrada;
  3. risco `destructive` para excluir, desativar, revogar, mexer em credencial/senha/token ou em
     autoridade (perfis, permissões, atribuições); `summarize` para todo `write`/`destructive`;
     `redact` para entradas com segredo; nunca devolva hash, senha ou segredo de integração;
  4. atualize a tabela em `aicontext/modules/opex-agent.md` e os testes de
     `__tests__/features/opex-agent/` (o teste do catálogo falha se faltar implementação).
- O agente age sempre como o usuário real: o acesso é revalidado antes de cada ferramenta, respeita
  "Visualizar como" e nunca amplia permissões. Não crie ferramenta que altere a configuração do
  próprio agente. **Exceção:** as memórias dos agentes (inclusive as do próprio Agente Opex) têm
  ferramentas (`aicontext/modules/ai-memories.md`).
- Agente de IA novo com memórias: registre em `src/features/ai/agents.ts`, coloque o
  `AgentMemoriesCard` na aba dele e acrescente `memoriesSection(await agentMemoryTexts(id))` às
  instruções do runner.
- Rode somente testes explicitamente selecionados. Não rode a suíte completa nem build sem pedido.
- Nunca altere `~/code/opex` ao desenvolver o Ciliar; ele é somente uma referência de leitura.
