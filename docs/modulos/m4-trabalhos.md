# M4 — Trabalhos (Kanban + horas)

Todo trabalho nasce de um **pedido aceito** (M3), na coluna **Abertura**. Referência visual e de
comportamento: `~/code/opex` — `features/tasks/components/TaskBoard.tsx` (Kanban dnd-kit em vários
contêineres) e `TaskViewSwitch.tsx` (alternância Kanban | Tabela).

## 1. Visualizações

- **Kanban | Tabela** com o mesmo switch do Opex.
- **Negócio ativo** (dentro do espaço do negócio) e **visão geral** com os trabalhos de todos os
  negócios do usuário (filtro por negócio).
- **Visão geral**: o Kanban mostra só as 4 colunas fixas + uma coluna agrupada **"Outras etapas"**
  (o card exibe o nome da coluna real); mover para uma coluna customizada só dentro do negócio. A
  Tabela mostra a coluna real.
- Movimentação **livre por arrastar** (qualquer coluna → qualquer coluna), também por teclado.

## 2. Colunas

```
Abertura → [customizadas…] → Execução → [customizadas…] → Validação → [customizadas…] → Pago
```

- **Fixas**: Abertura, Execução, Validação, Pago — **sem nenhuma alteração** (nome, cor, ordem).
- **Customizadas por negócio**: criadas, renomeadas e reordenadas livremente **entre Abertura e Pago**
  (nunca antes de Abertura nem depois de Pago).
- Coluna customizada **com trabalhos não pode ser excluída** (bloqueia até esvaziar).

## 3. Card

Código do pedido + título, cliente, valor, prazo com selo de alerta ("Vence em X dias"/"Atrasado",
M3) e **horas estimadas × apontadas** (barra de progresso).

## 4. Detalhe do trabalho

- Dados do pedido (itens, horas estimadas, valor, prazo) **editáveis**, com histórico (M3).
- **Notas/comentários** internos; só o autor edita/exclui a própria nota (registrado na auditoria).
- **Anexos próprios** (entregáveis), mesmos limites dos documentos (M2).
- **Histórico de movimentação**: coluna de origem/destino, data/hora e ator.
- **Converter em Sucesso**: atalho que cria um Sucesso (M2) já vinculado ao trabalho e ao cliente.

## 5. Horas

- **Horas estimadas**: vêm dos itens do pedido; **editáveis** a qualquer momento.
- **Apontamento manual** de horas realizadas (**sem cronômetro**). Cada lançamento tem:
  - **item/atividade**: um item do pedido **ou** uma atividade do negócio que não estava no pedido
    (o valor/hora é congelado no lançamento);
  - **data** trabalhada;
  - **horas** no formato `h:mm`;
  - **descrição** opcional.
- Horas apontadas alimentam a meta **por hora** (M2) e a barra do card.

## 6. Pago

- Ao mover para **Pago** o sistema pede:
  - **data do pagamento** (padrão hoje) — é a data usada no faturamento das metas;
  - **valor recebido** — padrão **valor do pedido**, editável;
  - **forma de pagamento** — texto livre com sugestão das já usadas (PIX, transferência…).
- **Faturamento bruto** = soma dos valores recebidos dos trabalhos em Pago, pela data do pagamento.
- **Sair de Pago** exige confirmação explícita e **remove o trabalho do faturamento** (o registro do
  pagamento fica no histórico).

## 7. Arquivamento

- Trabalho desistido/cancelado após o aceite é **arquivado** (some do Kanban/Tabela, pode restaurar),
  com **prazo próprio** de exclusão definitiva (Integrações › Plataforma) e exclusão manual de um
  arquivado com confirmação.
- Trabalho **arquivado que estava em Pago sai do faturamento** (metas e dashboard) enquanto estiver
  arquivado; restaurá-lo volta a contar com o pagamento registrado. Arquivar um trabalho em Pago
  pede confirmação avisando isso.

## 8. Permissões

`businesses.use` (próprios negócios) e `businesses.view_all` (somente leitura).

## 9. Agente Opex (ferramentas)

| Grupo | Ferramentas | Risco |
|---|---|---|
| Colunas | `list_work_columns` | read |
| | `create_work_column`, `update_work_column`, `reorder_work_columns` | write |
| | `delete_work_column` (somente vazia) | destructive |
| Trabalhos | `list_works`, `get_work` (com horas, notas, histórico) | read |
| | `move_work` (exceto para/de Pago) | write |
| | `mark_work_paid` (data, valor, forma) | write (com `summarize`) |
| | `unmark_work_paid` (sai de Pago, remove do faturamento) | destructive |
| | `update_work` (itens, horas estimadas, valor, prazo) | write |
| | `archive_work`, `restore_work`, `delete_work` | destructive / write / destructive |
| Horas | `list_time_entries`, `create_time_entry`, `update_time_entry` | read / write / write |
| | `delete_time_entry` | destructive |
| Notas e anexos | `add_work_note`, `add_work_attachment` (arquivo do chat) | write |
| | `convert_work_to_success` | write |

## 10. Auditoria

Criação (a partir do pedido), movimentações, pagamento e estorno de Pago, edições, horas, notas,
anexos, colunas e arquivamento/exclusão.
