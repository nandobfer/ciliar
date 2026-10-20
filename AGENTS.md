# Ciliar

Leia `aicontext/README.md` e o guia do módulo antes de desenvolver.

- App Next.js único com pnpm; TypeScript estrito; rotas em `src/app`, regras em `src/features`,
  infraestrutura em `src/lib`, UI compartilhada em `src/components`.
- Base copiada do Opex. Preserve os componentes e bibliotecas existentes; não reescreva a UI.
- Tema escuro fixo, primária `#8000FF`, cores por tokens. Shadcn/Radix, Tailwind 4, lucide-react,
  sonner, date-fns e Framer Motion (respeitando movimento reduzido).
- Escopo atual: Integrações, Usuários, Perfis, Visualizar como e o Agente Opex (chat com
  ferramentas), por solicitação do usuário.
- Auth.js nativo no Next, e-mail/senha Argon2id; sem cadastro público. Toda API administrativa
  exige sessão válida e autorização Perfix no servidor, inclusive chamadas diretas.
- O CLI `pnpm user:create` é a única entrada de bootstrap; não crie contas no startup.
- Nunca confunda o ator real com o alvo da simulação. Marcador explícito por requisição/aba;
  auditoria preserva o ator real. Preserve o histórico antigo do ator `local`.
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
  próprio agente.
- Rode somente testes explicitamente selecionados. Não rode a suíte completa nem build sem pedido.
- Nunca altere `~/code/opex` ao desenvolver o Ciliar; ele é somente uma referência de leitura.
