# Trabalhos (M4)

Implementação em `src/features/works/`, conforme `docs/modulos/m4-trabalhos.md`. Referência visual
e de comportamento: Tarefas do `~/code/opex` (`TaskBoard`, `TaskColumn`, `TaskCard`, `TaskTable`,
`TaskViewSwitch`, `ColumnFormDialog`, `TaskDetailPage`), copiadas e adaptadas.

## Telas e acesso

- `/negocios/[id]/trabalhos` (item "Trabalhos" do espaço) e `/trabalhos` (menu principal, visão
  geral de todos os negócios do dono efetivo, filtro por negócio). Detalhe em
  `/negocios/[id]/trabalhos/[workId]`.
- **Kanban | Tabela** pelo `WorkViewSwitch` (cópia do `TaskViewSwitch`). Preferências (visão,
  ordenação, arquivados, ordenação da tabela) no navegador (`usePersistentState`), separadas para o
  negócio e a visão geral.
- **Visão geral**: Kanban com as 4 fixas + "Outras etapas" (antes de Pago) agrupando as
  customizadas; o card mostra o negócio e o nome da coluna real. "Outras etapas" não recebe cards
  (mover para customizada só dentro do negócio). A Tabela mostra a coluna real e "Mover para…" só
  oferece as fixas.
- Movimento livre por arrastar (dnd-kit: mouse, toque e **teclado** — espaço pega, setas movem,
  espaço solta) e por "Mover para…" (tabela e detalhe). Otimista nas listas; volta se o servidor
  recusar.
- `businesses.use` escreve nos próprios negócios; `businesses.view_all` só lê (auditado pela
  seção `works`). Simulação de usuário age sobre o alvo (`businessOwnerOf`) com o ator real na
  auditoria. APIs sem painel (`requiresPanel`), rotas explícitas em `access/server/policy.ts`.

## Colunas

- Fixas `opening`, `execution`, `validation`, `paid` (Abertura, Execução, Validação, Pago) com
  nome, cor, ícone e ordem imutáveis (`FIXED_WORK_COLUMNS` em `board.ts`): sem alça, sem menu,
  cadeado no cabeçalho.
- Customizadas (`business_work_columns`, chave `col-` + 12 hex): nome, cor, ícone e descrição
  (W3, sem WIP), até 20 por negócio. Ordem em `business_work_layouts` (`order` por negócio).
- `normalizeWorkLayout`: Abertura primeiro, Pago por último, Execução antes de Validação e as
  customizadas no trecho em que estavam (nunca antes de Abertura nem depois de Pago). Reordenar
  exige exatamente as colunas atuais (`COLUMNS_CHANGED`) e um layout válido (`WORK_COLUMN_FIXED`).
  Criar "depois de Pago" entra antes de Pago.
- Excluir só coluna sem trabalhos, **arquivados inclusive** (`WORK_COLUMN_NOT_EMPTY`).

## Card, ordenação e posição

- Card: código do pedido + título, cliente, valor, selo de prazo (`workDeadlineAlert`: Vence
  hoje/em X dias/Atrasado pela antecedência do negócio; Pago sem alerta), barra horas estimadas ×
  apontadas (`hoursProgress`, acima de 100% em alerta) e, em Pago, a data do pagamento.
- Ordenação (W2): **Manual** (posição persistida `position`, ponto médio entre vizinhos ao soltar,
  `computeDropOrderInList` do Opex), **Prazo** (sem data no fim), **Mais novos**, **Mais antigos**.
  Fora da Manual, soltar na mesma coluna não muda nada; entre colunas, o card vai para o fim.

## Pago e faturamento

- Entrar em Pago só por `POST …/payment` (`MarkPaid`): data do pagamento (padrão hoje; é a data do
  faturamento), valor recebido (padrão o valor do pedido) e forma (texto livre com sugestões das já
  usadas pelo dono em todos os negócios, `GET /api/works/payment-methods`, + padrões PIX,
  Transferência…). `move` para/de Pago responde `WORK_PAYMENT_REQUIRED`/`WORK_UNPAY_REQUIRED`.
- **Editar pagamento** (W4): o mesmo endpoint num trabalho já pago corrige data/valor/forma; o
  histórico guarda `edited`.
- **Sair de Pago** (`POST …/unpay`, `confirm: true` obrigatório + coluna de destino): pagamento
  atual vira `null` e o histórico guarda `unmarked` com os valores anteriores.
- `payments[]` no trabalho: `marked | edited | unmarked`, com ator. Movimentações em
  `business_work_moves` (origem/destino, data, ator real, simulação; a criação pelo aceite tem
  `from: null` e ator `client:link` quando foi pelo link).
- Faturamento bruto (`businesses/server/revenue.ts` → `measureRevenue`): soma do valor recebido
  dos trabalhos **ativos** em Pago pela `payment.paidOn`; horas da meta por hora = `loggedMinutes`
  desses trabalhos. Arquivar um pago o tira do faturamento enquanto arquivado (aviso na
  confirmação); restaurar volta a contar. Dashboard e metas do M2 passam a medir de verdade.

## Detalhe do trabalho

Página no padrão do `TaskDetailPage` (cabeçalho com "Mover para…", Ver pedido, Converter em
Sucesso, Arquivar/Restaurar/Excluir; abas; resumo à direita):

- **Pedido** (W1): itens (horas estimadas `h:mm`, valor/hora congelado, novos só de atividades
  ativas), valor ajustado e prazo. `PATCH /works/[id]` altera o **pedido aceito** e grava versão
  `work` **não publicada** em `business_order_versions` (o link público mostra a versão aceita — a
  cópia da decisão — e só lista versões publicadas). O trabalho guarda a cópia
  `estimatedMinutes`/`totalCents`/`dueDate`. Histórico de versões reaproveita `OrderVersionsCard`.
- **Horas** (`business_work_time_entries`): item do pedido (`orderItem` + id do item) ou atividade
  ativa fora do pedido (`activity`), valor/hora congelado no lançamento, data trabalhada (não
  futura no fuso do usuário, `TIME_ENTRY_FUTURE`), `h:mm` (1 a 1440 min) e descrição opcional.
  `loggedMinutes` recalculado na transação de cada lançamento. Permitido em qualquer coluna,
  inclusive Pago; bloqueado com o trabalho arquivado.
- **Notas** (`business_work_notes`): o autor é o usuário REAL; só ele edita/exclui
  (`WORK_NOTE_NOT_AUTHOR`, inclusive para quem simula o dono), com auditoria.
- **Anexos**: arquivos `purpose: "work"` do espaço (mesmo fluxo e limites dos documentos), presos
  ao trabalho ao terminar o envio; remover apaga do storage. Não aparecem no link do cliente.
- **Movimentações** e **Pagamento** (estado atual + linha do tempo).
- **Converter em Sucesso** (W6): abre o `SuccessDialog` do M2 pré-preenchido (título do pedido,
  data do pagamento ou hoje, cliente) com `workId`; um por trabalho (`WORK_ALREADY_CONVERTED`),
  `successId` no trabalho; depois vira "Ver sucesso". Excluir o sucesso libera a conversão.

## Arquivamento e exclusão

- Arquivar/restaurar (`…/archive`, `…/restore`): some do Kanban/Tabela (filtro "Arquivados"
  mostra), prazo `retentionDays.jobs` (Integrações › Plataforma › "Trabalhos"), `purgeAt` no DTO.
- Excluir definitivamente só arquivado (W5): apaga horas, notas, movimentações e anexos; o pedido
  continua **Aceito** como registro (`workId: null`, `workDeletedAt`, mostrado no pedido) e o
  sucesso ligado perde o `workId`. Rotina `businesses-purge` chama `purgeArchivedWorks` (ator
  `system:businesses-purge`, `business.work.purge`).
- Excluir/purgar o negócio remove trabalhos, colunas, layout, movimentações, notas e horas.

## Persistência e transações

- Coleções: `business_works` (ampliada do M3), `business_work_columns`, `business_work_layouts`,
  `business_work_moves`, `business_work_notes`, `business_work_time_entries` (`workModels()`;
  `orderModels().works` aponta para o mesmo modelo). Índices pela migração
  `ensure-business-indexes` (**sem `dbConnect`**).
- Toda escrita por `writeItem(access, businessId, "works", …)`: negócio ativo, acesso relido, fence
  do dono e `version` otimista (`VERSION_CONFLICT`). Editar dados comerciais publica também
  `kind: orders`.
- Tempo real: `business-space-updated { businessId, kind: "works" }` (só invalidação);
  `WorksRealtime` na casca relê trabalhos em `works`, `orders` (aceite pelo link) e `successes`.

## Auditoria

`business.work.{create,move,pay,payment_edit,unpay,update,archive,restore,delete,purge,convert_success}`,
`business.work_column.{create,update,delete,reorder}`, `business.work_time.{create,update,delete}`,
`business.work_note.{create,update,delete}`, `business.work_file.{add,remove}` — ator real e
marcador da simulação.

## Ferramentas e testes

Ferramentas do Agente Opex: grupos `work-columns`, `works`, `work-time`, `work-notes` (tabela em
[opex-agent.md](opex-agent.md)). Testes selecionados em `__tests__/features/works/`:
`works-pure.test.ts` (quadro, posição, fluxos, faturamento, entradas e rotas), `works.test.ts`
(MongoMemoryReplSet: aceite, colunas, Pago/estorno/correção, faturamento e arquivamento, W1, horas,
notas, sucesso, exclusão/purge, ferramentas) e `works-ui.test.tsx` (card, barra de horas, switch).
