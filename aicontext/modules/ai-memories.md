# Memórias dos agentes e uso "Resumo"

Cópia da funcionalidade de memórias do `~/code/sipal/crm-marketing-campanhas` (`/integracoes/ia`):
mesmos componentes (`MemoryList`, `MemoryEditor`, `useMemories`, `ConfirmDialog`, `FeatureFormShell`,
`SummaryFeatureTab`) e o mesmo serviço, com uma lista por **agente** em vez dos escopos global/empresa.

## Agentes

- Catálogo puro `src/features/ai/agents.ts` (`AI_AGENT_IDS`/`AI_AGENTS`): `opex-agent` (Agente Opex) e
  `business-interviewer` (Agente Entrevistador). Agente futuro: registrar aqui, pôr o
  `<AgentMemoriesCard agentId=… />` na aba dele e somar `memoriesSection(await agentMemoryTexts(id))` às
  instruções do runner. A API, o enum `agent` das ferramentas e a permissão já o cobrem.
- As memórias entram nas instruções de sistema ("Memórias e instruções permanentes"), em ordem de
  criação, a cada turno (a mudança vale a partir da próxima resposta).

## Dados e serviço

- `agent_memories` (`AgentMemory`): `agentId`, `texto`, `resumo`, `createdBy/updatedBy`, datas; índice
  `{ agentId, createdAt }` (migração `ensure-agent-memory-indexes`).
- `src/features/ai/server/agent-memory-service.ts`: listar, ler, criar, editar, excluir (até 50 por
  agente, 409 `MEMORY_LIMIT`; agente fora do catálogo 404 `AI_AGENT_NOT_FOUND`). Texto 3–2.000
  caracteres (`memoryInputSchema`). Auditoria `MemoriaAgente` (CRIAR/ATUALIZAR/EXCLUIR com o texto,
  ator real + simulação). Tempo real: `ai-memories-updated { agentId }` em `private-integration-ai`
  (só invalidação).
- Permissões Perfix (ramo **Memórias dos agentes**): `ai_memories.view` (ver; viewKey) e
  `ai_memories.edit` (criar/editar/excluir, sensível). O serviço confere de novo. O card só aparece com
  `view`; sem `edit`, somente leitura.

## Uso "Resumo" (`/integracoes/ia?aba=resumo`)

- Feature `summary` em `ai_feature_settings`: ativo, `main` (mesmo cartão de modelo do Agente Opex),
  instruções e tamanho máximo do resumo (40–200). `GET/PUT /api/ai/features/summary`
  (`integrations.ai.view/edit`).
- `formatMemory` (servidor) revisa o texto e gera o resumo de uma linha (JSON `{"texto","resumo"}`,
  `parseFormattedMemory` no módulo puro `summary.ts`). Nunca lança: sem IA, salva como escrito com o
  resumo de reserva (`formatadaPorIa: false` → aviso na tela e `formattedByAi` nas ferramentas).

## APIs

| Rota | Permissão |
|---|---|
| `GET/POST /api/ai/agents/[agentId]/memories` | `ai_memories.view` / `ai_memories.edit` |
| `GET/PATCH/DELETE /api/ai/agents/[agentId]/memories/[memoryId]` | `ai_memories.view` / `ai_memories.edit` |
| `GET/PUT /api/ai/features/summary` | `integrations.ai.view` / `integrations.ai.edit` |

## Agente Opex

Grupo **Memórias dos agentes**: `list_agent_memories` e `get_agent_memory` (read, `ai_memories.view`),
`create_agent_memory` e `update_agent_memory` (write) e `delete_agent_memory` (destructive), com
`ai_memories.edit`. Exceção documentada no `AGENTS.md`: o Agente Opex gerencia também as próprias
memórias.

## Testes

`__tests__/features/ai/memories.test.ts` (serviço, permissões, limite, Resumo com e sem IA, ferramentas),
`__tests__/features/ai/summary.test.ts` (módulo puro) e `__tests__/features/ai/memory-list.test.tsx`.
