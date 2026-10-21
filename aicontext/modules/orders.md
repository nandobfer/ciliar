# Clientes e Pedidos (M3)

Implementação em `src/features/orders/`, conforme `docs/modulos/m3-clientes-pedidos.md`.

## Telas e acesso

- `/clientes`: clientes do usuário, busca por nome/e-mail/telefone, situação e negócio (em que
  têm pedidos). Criar/editar em diálogo; detalhe `/clientes/[id]` com contatos, observações
  privadas, pedidos de todos os negócios e totais **separados por moeda**.
- `/pedidos`: visão global com busca, filtros por negócio, cliente e status. Novo pedido escolhe
  um negócio ativo. Dentro do espaço: `/negocios/[id]/pedidos`, `/novo` e `/[orderId]`.
- `businesses.use` permite escrita do dono efetivo; `businesses.view_all` só leitura de detalhes
  alheios, auditada. Listas globais são do dono efetivo, não um dump de outros usuários.
- Simulação de usuário segue `businessOwnerOf`: alvo como dono e ator real na auditoria.
- APIs autenticadas passam por `withProtectedRoute`; clientes/pedidos não exigem `admin.access`.

## Persistência e transações

- `business_clients`: `ownerId` do usuário (não do negócio), nome, contatos, observações privadas,
  status, arquivamento e versão otimista. Exclusão definitiva exige arquivado e **nenhum pedido**,
  de qualquer negócio/status. `businesses-purge` usa `retentionDays.clients`; com pedidos, fica.
- `business_orders`: negócio/dono/cliente, moeda, código sequencial por negócio (`orderSeq` no
  negócio, `PED-0001`), descrição, título/resumo e flags manuais, estado da IA, itens, total
  ajustado, prazo, anexos/visibilidade, link, decisões, versões e trabalho criado.
- Valores em centavos; horas em minutos inteiros, interface `h:mm`.
  Sugestão = Σ `round(minutes × hourlyRateCents / 60)`. `null` no ajuste volta ao calculado.
- Itens novos exigem atividade ativa do negócio e congelam nome/valor-hora; existentes são
  referenciados pelo id do item, preservando o preço mesmo se a atividade mudar.
- Escritas pelo prestador usam `writeItem`/`businessTransaction`: negócio ativo, acesso relido,
  fence do dono e `version`. Decisão pública, retorno da IA e purge de clientes compartilham esse
  fence. O formulário usa a versão em que começou a edição, não a de uma atualização recebida.
- `business_order_versions`: snapshot, número, motivo (`send`, `edit`, `reopen`), publicação,
  ator e simulação. Antes do primeiro envio não grava versões; depois, cada edição grava.
  Rascunhos/reabertura não são públicos; o envio publica a versão atual. Prorrogar sem mudança
  não duplica snapshot. Cliente vê diferenças apenas entre versões publicadas.
- Decisão guarda cópia imutável e número da versão, nome, data, IP e ator/origem. Aceite cria
  `business_works`, único por pedido: coluna `opening` (Abertura), horas e valor copiados.
  **Sem UI de Kanban no M3**; o pedido aceito é somente leitura (edição via trabalho no M4).
- Qualquer pedido/trabalho trava a moeda, inclusive rascunho/cancelado. Excluir/purgar negócio
  remove pedidos, versões e trabalhos; mantém clientes do usuário.
- Índices em `ensure-business-indexes`, **sem `dbConnect` na migração**.

## Estados e link público

`draft → sent → accepted | rejected`; `rejected → reopen → draft`;
`draft | sent → cancelled`. Aceite/recusa manual somente em `sent`.
Revogar link de `sent` volta a `draft`. Transição inválida: `ORDER_INVALID_TRANSITION`.

- Link `/orcamento/[token]` fora de `(app)`; APIs `/api/public/orders/[token]`, `/accept`,
  `/reject`, `/files/[fileId]` e `/logo`, sem sessão. Autoriza só aquele pedido por token.
- `ped_` + 24 bytes aleatórios, cifrado AES-256-GCM para recuperar ao copiar; SHA-256 indexado
  para busca e comparação final em tempo constante. Nunca token no DTO ou auditoria.
- Link válido prorrogado mantém token; expirado/revogado recebe novo. Revogar/cancelar remove
  token. Copiar exige dono; logs de erro da API ocultam o segmento secreto.
- Validade inclusiva no fuso do envio; expirado mostra orçamento somente leitura.
  Negócio arquivado mostra indisponível, sem conteúdo do pedido, e bloqueia decisão.
- Público só recebe dados comerciais, título/descrição, itens/valor/prazo, anexos visíveis,
  alterações publicadas e decisão. Nunca observações privadas, dono, IP ou auditoria.
- Aceite exige nome; recusa tem motivo e nome opcionais. IP: `cf-connecting-ip`, depois
  `x-real-ip`. Limites de leitura por IP e de decisão por IP/IP+hash do token; mutações conferem
  origem e marcador. Respostas e arquivos sem cache; página sem indexação/referrer.
- Tema e modo do negócio pela mesma implementação do espaço. SMTP usa tema do negócio.
- Arquivos `purpose: order` reutilizam reserva/conclusão/limites da Plataforma e importação do
  chat. `clientVisible` padrão true; remoção libera objeto. Sucessos têm seletor de cliente.

## IA, avisos e alertas

- `/integracoes/ia`, aba **Título de pedidos**; configuração `order-title` em
  `ai_feature_settings`, API `/api/ai/features/order-title`, `integrations.ai.view/edit`.
- Geração pós-resposta (`runAfterResponse`), origem de consumo `order-title`. Manual prevalece;
  limpar campo devolve à IA. Hash da descrição e releitura transacional evitam sobrescrever
  versão recente, campo manual ou pedido decidido. Mudança pública pela IA também gera versão.
- Desligado: título exibido é primeira linha da descrição. Falha: erro e Gerar novamente.
- SMTP opcional no envio e ao dono na decisão pública; falha não desfaz operação. Contato
  comercial sem e-mail usa o e-mail da conta do dono.
- `business-space-updated { businessId, kind: orders }`, `clients-updated { id }` e
  `order-decided { businessId, orderId }` no canal do dono. Só invalidação; toast relê API
  autorizada. Sem conteúdo/decisão privada no evento. Simulação não assina canal do alvo.
- `logic.ts`: alerta dos abertos por `deadlineAlertDays` do negócio (padrão 3), Vence hoje /
  Vence em X dias / Atrasado; aceitos e cancelados não têm alerta de pedido.

## Ferramentas, auditoria e testes

Grupos `clients` e `orders` sem painel, registrados no catálogo e seleção do Agente Opex.
Executam serviços com `context.access`, nunca HTTP. `send_order` só devolve URL com
`copyLink: true`; token não aparece em outras saídas. Ver tabela em `opex-agent.md`.

Auditoria `business.client.*`, `business.order.*`, `business.work.create`; decisão pública
com ator `client:link`, nome/IP. Ator real e marcador preservados na simulação.

Testes selecionados em `__tests__/features/orders/`: regras puras, MongoMemoryReplSet efêmero
(isolamento, suporte, simulação, moeda, preços congelados, versões, estados, token/validade,
aceites concorrentes, purge e ferramentas), UI pública e alertas. Regressões selecionadas do
espaço M2, catálogo de ferramentas e navegação. Nunca executar suíte completa/build sem pedido.
