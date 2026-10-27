# Calendário (CIL-4)

Implementação em `src/features/calendar/` (issue nandobfer/ciliar#5). Página **Calendário** no estilo
Google Agenda/Teams com visões **Dia / Semana / Mês**: prazos e períodos dos trabalhos, prazos dos
pedidos abertos, horas apontadas, expediente e eventos do Google. Pelo calendário é possível criar pedidos
e mover prazos. O **alerta de conflito de prazo** (sobreposição e capacidade) só avisa, nunca bloqueia.
A integração com o **Google Agenda** é opcional e funciona nos dois sentidos.

## Telas e acesso

- `/calendario`: item global "Calendário" (`navigation.ts`, ícone `CalendarDays`). Mostra todos os
  negócios ativos do dono efetivo, com filtro por negócio e a legenda de cores (cor primária de cada
  negócio).
- `/negocios/[id]/calendario`: seção "Calendário" do espaço (`BUSINESS_SPACE_SECTIONS`). Usa o mesmo
  componente (`CalendarPage` com `businessId`), filtrado pelo negócio. **A capacidade continua sendo
  calculada sobre todos os negócios ativos.**
- **Permissão `calendar.view`** (módulo `calendar` em `BUSINESS_MODULES`, subgrupo "Calendário" do
  catálogo, depende de `businesses.use`). Ela vale para a página, a aba, `/api/calendar/**` e o Google.
  Cada tipo de evento segue a visualização do próprio módulo:
  - prazos, períodos e horas: `works.view`;
  - prazos dos pedidos: `orders.view`;
  - criar pedido: `orders.edit`;
  - arrastar o prazo: `works.edit` ou `orders.edit`.

  O suporte (`businesses.view_all`) lê a aba de um negócio de outro usuário: somente leitura, com
  auditoria (`readBusiness` com a seção `calendar`), sem o Google e sem arrastar.
- **Migração `grant-calendar-permission`**: roda uma única vez (marcador em `app_migrations`). Todo perfil
  com `businesses.use` (exceto `*`) ganha `calendar.view`, com `version + 1` e auditoria
  `role.permissions_migrated` (ator `system`). Os índices ficam em `ensure-calendar-indexes`. Nenhuma
  das duas chama `dbConnect`.
- **Simulação**:
  - Simulando um **usuário**: tudo age como o alvo (`businessOwnerOf`), inclusive conectar ou desconectar
    o Google e escolher as agendas. A auditoria registra o ator real com o marcador.
  - Simulando um **perfil**: o calendário é o do administrador real.
  - **Risco registrado:** a conta Google que o administrador conecta enquanto simula fica ligada ao
    usuário simulado (`connectedBy` guarda o ator real).

## Visões (`components/`)

- **Mês** (`MonthView`): grade de dias (semana começa no domingo) com até 3 eventos por dia. O restante
  aparece num popover "+N". Dias sem expediente ficam hachurados. O "+" de cada dia cria um pedido.
- **Semana / Dia** (`TimeGridView`):
  - faixa de **dia inteiro** no topo, com prazos, períodos e horas apontadas;
  - **grade de horários** (48 px por hora) com os eventos do Google que têm hora, em faixas quando se
    sobrepõem (`layoutTimed`);
  - horas fora do expediente sombreadas (`offWindows`);
  - **linha tracejada que segue o ponteiro** (passo de 15 min), com o horário destacado na coluna da
    esquerda (`minuteAtOffset`);
  - linha vermelha do **agora**, atualizada a cada minuto.
- Barra de navegação: Hoje, ◀ ▶, `DatePicker` e o título do período. Ao lado ficam `CalendarViewSwitch`,
  os filtros por tipo (prazos e períodos de trabalhos, prazos de pedidos abertos, horas, Google e
  expediente) e, na página global, o filtro por negócio. A visão e os filtros ficam no navegador
  (`usePersistentState`), com chave separada para a página global e para cada negócio
  (`calendarPrefsKey`).
- **Clique num evento** abre um popover com o resumo e os links "Ver trabalho" / "Ver pedido" (ou "Abrir
  no Google"). No prazo, o popover traz também o alerta de conflito daquele item e, se o evento foi
  excluído no Google, o botão "Republicar".
- **Criar pelo calendário**: clicar num dia ou num horário, ou no botão "Novo pedido", abre o
  `NewOrderDialog`. Ele contém o `OrderForm` (`initialDueDate` = data clicada; a hora é ignorada) e o
  seletor de negócio quando há vários. O pedido nasce em **Rascunho** e segue o fluxo normal.
- **Arrastar o prazo** (dnd-kit; teclado: Espaço pega e solta) usa os PATCH que já existem:
  - trabalho: `PATCH …/works/[id]` `{dueDate, version}` (W1, versão `work` não publicada);
  - pedido em Rascunho: `PATCH …/orders/[id]`, sem versão;
  - pedido Enviado: o mesmo PATCH. Continua Enviado e grava uma versão **publicada** (decisão de
    27/10/2026: igual à tela).

  A mudança aparece na hora (otimista) e volta se o servidor recusar. Depois de soltar, aparecem um
  toast e o alerta de conflito do item. Pedido aceito não é arrastável: o prazo dele muda pelo trabalho.
- Tempo real (`useCalendarRealtime`): invalida em `business-space-updated` com `kind` `works`, `orders`
  ou `calendar`, e em `calendar-updated` (estado da conexão Google), no canal do dono. É só
  invalidação: o conteúdo é relido pela API.

## Eventos (`server/range.ts`)

`GET /api/calendar/events?from&to&businessId&types` (até 62 dias) devolve `CalendarRangeDto`. Os eventos
são derivados na leitura; nada é guardado.

| Tipo | Origem |
|---|---|
| `work-deadline` | trabalho **em andamento** (não arquivado, fora de Pago) com prazo, com o selo `workDeadlineAlert` e a marca de conflito |
| `work-period` | do dia do aceite (`decisions[].at` no fuso do usuário; sem ela, `work.createdAt`) até o prazo |
| `order-deadline` | pedido Rascunho/Enviado com prazo (status e "link expirado") |
| `logged-hours` | soma de `business_work_time_entries` por dia, com detalhe por trabalho |
| `google` | agendas lidas (somente consulta; sem os eventos publicados pelo Ciliar) |

Também devolve:
- `availability`: janelas do expediente por dia, em minutos (união dos negócios);
- `conflicts`: o nível mais forte de cada dia;
- `businesses`: cor e o que pode criar ou editar;
- `google`: a conexão, sem tokens;
- `googleError`: falha do Google. O resto do calendário continua funcionando.

Negócio arquivado some do calendário e do expediente.

## Alerta de conflito (`conflict.ts`, puro)

`deadlineConflict(input)` recebe agora, fuso, prazo D, horas estimadas, início (aceite ou hoje), o
próprio trabalho, os trabalhos em andamento, as disponibilidades e os ocupados do Google.

1. **Sobreposição** (`info`): o intervalo do item (hoje, ou o aceite, até D) cruza o período de algum
   trabalho em andamento. O aviso lista esses trabalhos.
2. **Capacidade** (`strong`): `necessárias > livres`.
   - **Livres** = expediente de **agora** até o fim de D − ocupação.
   - **Ocupação**:
     - horas restantes (estimadas − apontadas, mínimo 0) de cada trabalho. Prazo até D (ou atrasado)
       conta tudo; prazo depois de D conta só a parte proporcional ao expediente entre hoje e D dentro
       do período (sem expediente no período, usa o tempo corrido);
     - eventos "ocupado" do Google, só dentro do expediente.
   - **Expediente**: união das janelas de todos os negócios ativos (`availabilityIntervals`); dia sem
     janela vale 24 h; negócio sem disponibilidade não soma. Sem nenhuma disponibilidade, o expediente é
     zero e aparece o aviso "expediente não configurado".
   - No trabalho, as horas "necessárias" são as restantes.

Regras gerais:
- O próprio trabalho nunca entra na própria ocupação.
- Item sem prazo não entra em nada. Item sem horas estimadas só verifica a sobreposição.
- Prazo no passado ou hoje: as livres são as que sobram de hoje, ou zero.

O serviço `checkDeadlineConflict` (`GET /api/calendar/conflict`) monta essa entrada a partir de data +
minutos, ou de `orderId`/`workId` (a data informada prevalece). Quem pode ler pedidos ou trabalhos vê o
alerta mesmo sem `calendar.view`. O componente `DeadlineConflictAlert`/`DeadlineConflictNotice` aparece:
- no `OrderForm`, ao definir ou alterar o prazo;
- no diálogo de envio do link;
- no aceite manual (`ConfirmDialog`);
- no detalhe do trabalho, ao alterar o prazo (W1);
- no calendário, na marcação do dia e do evento e no aviso depois de arrastar.

**Nenhuma validação no servidor recusa a ação por causa de conflito.**

Tempo e fuso ficam em `time.ts` (`Intl`, sem biblioteca): `localToInstant` (inclusive na virada do
horário de verão), `dayKeyOf`, `rangeOfView` e `shiftAnchor`. O fuso vem de `x-ciliar-timezone`.

## Google Agenda (opcional, nos dois sentidos)

`server/google/`. O cliente REST usa `fetch`, sem SDK, e as mesmas credenciais do login
(`AUTH_GOOGLE_ID/SECRET`). Escopos pedidos só na conexão: `calendar.events` +
`calendar.calendarlist.readonly` (+ `openid email`). **São escopos sensíveis:** sem verificação do app
no Google Cloud, só usuários de teste conectam (decisão de 27/10/2026: implementar agora e verificar
depois).

### Conexão

- `POST /api/calendar/google/connect` devolve a URL do Google. O estado (hash, TTL de 10 min, uso
  único), o verificador PKCE, o ator real, o dono, o cabeçalho do "Visualizar como" da aba, o `returnTo`
  e o fuso ficam em `calendar_oauth_states`.
- `GET /api/calendar/google/callback` (protegida; navegação sem o cabeçalho da aba) confere a mesma
  sessão, relê o acesso com a simulação guardada, troca o código e grava os tokens **cifrados com
  AES-256-GCM** em `calendar_google_connections`, um por dono. Volta com `?google=conectado|cancelado|erro`.
- A conta conectada pode ser outra conta Google, diferente da do login. Trocar de conta apaga os
  vínculos anteriores.
- Os tokens nunca vão para o DTO, os logs ou a auditoria.

### Agendas e status

- `PATCH /api/calendar/google/settings` define a **agenda de publicação** (precisa ser gravável) e as
  **agendas lidas**. Trocar a de publicação recria tudo nela; os eventos antigos ficam como histórico.
- Status da conexão:
  - `active`;
  - `choose_calendar` (sem agenda de publicação, ou ela foi excluída no Google);
  - `reauth` (`invalid_grant` ou 401: "Reconectar");
  - `error`.
- Cota excedida (429/`rateLimitExceeded`): `backoffUntil` cresce de 1 min até 1 h.

### Do Ciliar para o Google

- Fila em `calendar_google_links`: `kind` `work-deadline | work-period | order-deadline`, `refId`,
  `eventId`, `etag`, `pushedHash`, `snapshot`, `dirty`, `attempts`/`nextAttemptAt`, `claimedUntil` e
  `status` `linked | unlinked`.
- Os serviços marcam o item depois do commit (`markCalendarDirty`, que nunca lança e não faz nada sem
  conexão):
  - pedidos: criar, editar, enviar, revogar, reabrir, cancelar, aceitar ou recusar (inclusive pelo link)
    e o título gerado pela IA;
  - trabalhos: W1, mover, Pago, sair de Pago, arquivar, restaurar, excluir e purgar.
- A fila (`processPublishQueue`) roda depois da resposta e na rotina. Eventos:
  - de **dia inteiro**, com fim exclusivo;
  - `transparency: transparent`;
  - `extendedProperties.private.ciliar = "1"`, mais `ciliarLinkId` e `ciliarKind`.
- O título e a descrição são do Ciliar e sempre sobrescrevem edições feitas no Google.
- **Os eventos ficam como histórico**: Pago, arquivado, excluído, aceito, cancelado, recusado ou expirado
  só mudam o título ("[Pago]", "[Expirado]"…).
- Item nunca publicado e já encerrado é descartado. Item excluído atualiza o título e desfaz o vínculo
  (`item_deleted`). Excluir ou purgar o negócio apaga os vínculos dele.

### Do Google para o Ciliar (`sync.ts`)

- Sincronização incremental (`syncToken`; 410 recomeça a lista completa) **só da agenda de publicação**.
- Mover a data aplica o novo prazo com `resolveAccess(dono)` e o fuso da conexão:
  - trabalho por `updateWork`, pedido aberto por `updateOrder`;
  - o fim do evento de período vira o prazo; o início é corrigido de volta;
  - auditoria `calendar.google.apply` (ator = dono, `source: "google"`);
  - `VERSION_CONFLICT`: relê e tenta de novo, até 3 vezes; no mesmo campo, vale a última.
- A data é corrigida de volta quando:
  - a data é inválida;
  - o pedido foi aceito, cancelado ou recusado, ou o link expirou;
  - o trabalho foi arquivado ou excluído;
  - o serviço recusou a mudança.
- **Excluir o evento** só desfaz o vínculo (`deleted_in_google`); ele não é recriado até
  `POST /api/calendar/google/republish` (`{kind,id}` ou `{all:true}`).
- Eventos sem a marca do Ciliar não são importados.
- O eco das mudanças do próprio Ciliar é ignorado pelo `etag` e pelo hash publicado, para não entrar em
  ciclo.

### Notificação push e rotinas

- Canal `events.watch` da agenda de publicação, renovado quando falta menos de 24 h.
- A rota pública `POST /api/public/calendar/google/notify` valida o canal e o token pelo hash em tempo
  constante, com limite por canal, e só agenda `syncConnection` + a fila depois da resposta.
- Exige `APP_ORIGIN` HTTPS. Em desenvolvimento local, o canal não é criado e a rotina cobre.
- Rotina interna **`calendar-google-sync`** (a cada 15 min): renova canais, sincroniza, marca pedidos
  com link expirado e processa a fila.
- "Sincronizar agora": `POST /api/calendar/google/sync`.

### Leitura e desconexão

- As agendas lidas são consultadas sob demanda (`singleEvents`, `timeMin/timeMax`, cache de 60 s por
  dono e período).
- Contam como **ocupados** os eventos opacos, não cancelados e não recusados pelo próprio usuário. Os
  de dia inteiro usam o fuso do usuário; os com hora são convertidos pelo ISO.
- **Desconectar** (`DELETE /api/calendar/google`): para o canal, revoga o refresh token e apaga os
  tokens e os vínculos. Os eventos ficam no Google.
- Auditoria: `calendar.google.{connect,settings,sync,republish,disconnect,apply}`, com o ator real e o
  marcador da simulação, nunca com tokens.

## Ferramentas do Agente Opex

Grupo `calendar` (sem painel), em `server/tools/calendar.ts`:

| Ferramenta | Risco | Permissões |
|---|---|---|
| `list_calendar_events` | read | `calendar.view` ou `businesses.view_all` |
| `check_deadline_conflict` | read | `calendar.view`, `orders.view`, `works.view` ou `businesses.view_all` |
| `sync_google_calendar` | write (`summarize`) | `businesses.use` + `calendar.view` |

Conectar, desconectar e escolher agendas **não** viram ferramentas, porque mexem em credencial.

## Testes

Em `__tests__/features/calendar/`:
- `conflict.test.ts`: fuso, expediente, sobreposição, capacidade, eventos do Google, disposição das
  visões e rotas/permissões.
- `calendar.test.ts`: MongoMemoryReplSet com eventos, permissões, suporte, simulação, conflito, o
  arraste pelos serviços W1/D3, a migração e as ferramentas.
- `google-sync.test.ts`: Google simulado por `fetch`. Cobre OAuth (estado, PKCE, sessão, simulação,
  tokens cifrados), publicação, cota, leitura, aplicar e corrigir de volta, excluir e republicar, eco,
  reconexão, agenda excluída, push e desconexão.
- `calendar-ui.test.tsx`: alerta, linha do ponteiro, sombreamento, "+N" e visões.
