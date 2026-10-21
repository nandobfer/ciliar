# M3 — Clientes + Pedidos

Todo **Trabalho** (M4) nasce de um **Pedido aceito**. Referências no `~/code/opex`: serviços
(`features/services`, título/resumo por IA em segundo plano) e portal de orçamentos
(`features/orcamentos`, acesso do cliente por token).

## 1. Clientes

- Pertencem ao **usuário** (não ao negócio): o mesmo cliente é usado em todos os negócios dele.
- **Tela global `/clientes`** (fora do espaço do negócio) com busca e **filtro por negócio**; o
  detalhe do cliente mostra os pedidos de todos os negócios. Totais separados **por moeda**.
- Também é possível **criar ou selecionar o cliente dentro do novo pedido** (inline).

| Campo | Regra |
|---|---|
| Nome | Obrigatório (pessoa ou empresa). |
| Contatos | E-mail e telefone/WhatsApp, opcionais. E-mail é necessário para enviar o orçamento por e-mail. |
| Observações | Texto livre **privado** (nunca aparece no link do cliente). |

- **Arquivar** como os itens do M2, com **prazo próprio** de exclusão definitiva (Integrações ›
  Plataforma). Cliente **com pedidos não é excluído definitivamente** (nem manual nem pela rotina);
  fica arquivado.

## 2. Pedido

Pedidos ficam no espaço do negócio e também na tela global **`/pedidos`**, com filtros por
negócio, cliente e status. Detalhes da implementação: `aicontext/modules/orders.md`.

| Campo | Regra |
|---|---|
| Código | Sequencial **por negócio** (`PED-0001`), exibido no link e no card do trabalho. |
| Negócio | Obrigatório; define a moeda. |
| Cliente | Obrigatório (selecionar ou criar inline). |
| Necessidade | **Somente descrição** (texto livre), obrigatória. |
| Título e resumo | **Gerados por IA** a partir da descrição; editáveis manualmente (ver §4). |
| Itens | Vários: atividade do negócio + **horas estimadas** + **valor/hora congelado** da atividade. |
| Valor total | **Calculado** (Σ horas × valor/hora) como sugestão e **editável** (valor ajustado manualmente fica marcado). |
| Data de entrega | Prazo/SLA. |
| Anexos | Briefing, referências; mesmos limites dos documentos (M2). Cada anexo tem **"visível ao cliente"** (padrão sim). |
| Validade do link | Data "válido até" do orçamento enviado; padrão **15 dias** (configurável por negócio), editável por pedido. |

- Somente atividades **ativas** entram em novos itens; o valor/hora é copiado no momento da inclusão
  e não muda se a atividade mudar depois.
- **Horas estimadas sempre editáveis**, também depois de virar trabalho.

## 3. Status

```
Rascunho → Enviado → Aceito → (gera Trabalho em "Abertura")
   │          │    ↘ Recusado → (Reabrir) → Rascunho
   └──────────┴─→ Cancelado
```

- **Cancelado**: desistência antes da decisão, a partir de Rascunho ou Enviado, pelo prestador;
  revoga o link. Estado final.
- **Reabrir** um Recusado volta a Rascunho como nova versão; a recusa permanece no histórico.

- **Rascunho**: em edição, sem link.
- **Enviado**: link do orçamento gerado (copiar e/ou e-mail).
- **Aceito/Recusado**: decidido **pelo prestador** (manual, com o ator registrado) **ou pelo cliente**
  no link público.
- Ao **aceitar**, o Trabalho é criado na coluna **Abertura** do Kanban (M4).
- **Edição após envio**: permitida; o link sempre mostra a **versão atual** junto com o **histórico de
  alterações**. Cada alteração gera uma versão do pedido.
- **Edição após aceite**: itens, horas, valor e prazo seguem editáveis pelo trabalho; tudo fica no
  histórico. A **versão aceita** permanece imutável como registro.

## 4. Agente de título e resumo do pedido

Mesmo padrão dos serviços do Opex:

- Configuração própria em `/integracoes/ia`, aba **"Título de pedidos"** (provedor, modelo, variante,
  instruções com "Restaurar padrão"); `integrations.ai.view/edit`.
- Roda **em segundo plano** ao criar/alterar a descrição; nunca bloqueia o formulário.
- Até gerar (ou se a IA estiver indisponível), o título exibido é a primeira linha da descrição.
- Falha vira status de erro com **"Gerar novamente"**.
- **Edição manual** do título/resumo prevalece; a IA não sobrescreve uma descrição mais recente que a
  que gerou a saída (hash da origem).
- Consumo registrado nos logs de consumo de IA (origem própria).

## 5. Link do orçamento (cliente, sem login)

- **Link único por pedido**, com token secreto, **sem login**.
- **Validade por pedido** ("válido até"); padrão 15 dias por negócio. Vencido, o link mostra
  **"expirado"** e o prestador pode reenviar (nova validade).
- O token fica **guardado cifrado** (AES-256-GCM, não só hash) para o prestador usar **"Copiar link"**
  a qualquer momento enquanto válido.
- Envio: **Copiar link** e/ou **e-mail** ao cliente via SMTP (se configurado).
- O cliente vê: código, **dados do negócio** (nome, logo, links, descrição, **contato comercial**),
  **título e descrição**, **itens com horas e valor/hora**, valor total, **prazo de entrega**, **anexos
  visíveis ao cliente** e o **histórico de alterações**. Nunca vê observações do cliente nem dados internos.
- **Aceite** exige o **nome de quem aceita**; registra **data/hora, IP** e uma **cópia imutável da
  versão aceita**. **Recusa** aceita **motivo opcional** (mesmos registros).
- Depois de decidido, o link mostra a decisão (somente leitura).
- O prestador pode **revogar** o link (volta a Rascunho).
- Rota pública com limitação de taxa; token comparado em tempo constante.

## 6. Notificação ao prestador

Quando o cliente aceita/recusa: **toast em tempo real** (Pusher, só invalidação; o conteúdo é relido
pela API) e **e-mail** ao prestador (SMTP, se configurado).

## 7. Alertas de prazo

- **Destaque visual** em listas e cards: **"Vence em X dias"** a partir da antecedência e
  **"Atrasado"** após a data de entrega.
- Antecedência **por negócio**, padrão **3 dias** (campo da ficha do negócio).
- Vale para pedidos abertos e trabalhos que ainda não estão em **Pago**.

## 8. Permissões

`businesses.use` cobre clientes e pedidos do próprio usuário; `businesses.view_all` só leitura.
A rota pública do link não usa sessão: autoriza somente pelo token, restrita àquele pedido.

## 9. Agente Opex (ferramentas)

| Grupo | Ferramentas | Risco |
|---|---|---|
| Clientes | `list_clients`, `get_client` | read |
| | `create_client`, `update_client` | write |
| | `archive_client`, `restore_client`, `delete_client` (sem pedidos) | destructive / write / destructive |
| Pedidos | `list_orders`, `get_order` (com versões e decisão) | read |
| | `create_order`, `update_order` (itens, horas, valor, prazo, anexos do chat) | write |
| | `regenerate_order_title` | write |
| | `send_order` (gera link/token e opcionalmente envia e-mail) | destructive |
| | `revoke_order_link` | destructive |
| | `accept_order` (cria o trabalho), `reject_order`, `reopen_order` | write (com `summarize`) |
| | `cancel_order` (revoga o link) | destructive |

O token do link não é devolvido ao modelo além da URL que o próprio usuário pediu para copiar.

## 10. Auditoria

Clientes (CRUD/arquivo), pedidos (criação, versões, envio, revogação, e-mail), decisões (ator: prestador
ou cliente pelo link, com nome/IP) e criação do trabalho.
