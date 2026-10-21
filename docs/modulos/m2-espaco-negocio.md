# M2 — Espaço do negócio

Núcleo de cada negócio. Só o dono acessa (e quem tem `businesses.view_all`, auditado). Tudo que a
tela faz também é feito pelo **Agente Opex** com ferramentas.

## Navegação

Com um negócio aberto, a barra lateral mostra as páginas do espaço (Dashboard, Ficha, Atividades,
Metas, Documentos e Sucessos) abaixo do seletor de negócio (P47; a Entrevista saiu, P55). Criar e editar itens é
feito em diálogo sobre a lista (P54). Negócio arquivado abre somente leitura, com "Restaurar" (P53).

## 1. Página inicial: Dashboard

- Período no topo (como no Opex): **Mês atual** (padrão), 3, 6 ou 12 meses (P57).
- Indicadores: faturamento bruto no período, meta atual (% atingido), atividades ativas, valor/hora médio,
  documentos e sucessos no período.
- A meta atual numa linha inteira: progresso (atingido × alvo), quanto falta e dias restantes (P63).
- Gráficos: faturamento bruto × a meta mensal que valia em cada mês, valor por hora das atividades,
  evolução do valor/hora, sucessos no período e atividades/documentos por categoria. A primeira cor
  dos gráficos segue a cor primária do negócio (P56). Os de faturamento aparecem desde já, vazios até
  existirem trabalhos pagos (M4, P58).
- Atalhos do espaço numa coluna à direita.
- Trabalhos por coluna do Kanban entram com o M4.

## 2. Ficha do negócio (CRUD)

Editada por **formulário** (padrão de telas do `~/code/opex`) **e** pelo Agente Opex.

| Campo | Regra |
|---|---|
| Nome | Texto; vazio vira "Negócio N". |
| Tipo | `PF` / `PJ`. |
| Subtipo | Texto livre (MEI, ME, EPP, autônomo…). |
| Área/segmento | Texto livre. |
| Descrição/apresentação | Texto longo. |
| Logo/foto | Imagem (Storage S3). |
| Site e redes | Lista de URLs. |
| Disponibilidade | Dias da semana + janela de horário por dia; tudo opcional. |
| Moeda | BRL padrão; BRL, USD, EUR… |
| Contato comercial | E-mail e telefone, opcionais; sem e-mail, vale o e-mail atual da conta (P51). Exibido no link do orçamento (M3). |
| Antecedência do alerta de prazo | Dias; padrão 3 (M3). |
| Validade padrão do link do orçamento | Dias; padrão 15 (M3). |

Todos os campos nativos podem ser perguntas do roteiro do Entrevistador (M1), inclusive Descrição.
Arquivar/restaurar/excluir seguem o M1. A **moeda** só pode ser trocada enquanto o negócio não tiver
pedidos/trabalhos; valores já cadastrados (atividades, metas) **não são convertidos** e a tela avisa.

## 2.1 Tema do negócio

Cada negócio define sua **cor primária** e o **modo claro/escuro** (padrão: `#0B57C4`, escuro).
Referência de implementação: `~/code/sipal/crm-marketing-campanhas/src/lib/companies/theme.ts`.

- Sobrescreve `--primary`, `--primary-foreground`, `--ring` e os destaques da sidebar
  (`--sidebar-primary`, `--sidebar-primary-foreground`; o fundo da sidebar continua neutro, P49) no
  contêiner do layout do negócio **e** como regra `:root` (para diálogos, popovers, tooltips e toasts
  renderizados no `<body>`).
- Foreground escolhido por **contraste WCAG ≥ 4,5:1** (branco ou quase-preto); cor inválida ou sem
  contraste cai na cor padrão do Ciliar (`#0B57C4`).
- Valores CSS gerados **somente** a partir da cor validada (nunca do texto digitado): sem injeção de CSS.
- Pré-visualização ao vivo na edição.
- **Modo claro**: o Ciliar só tem tokens escuros; os tokens claros são copiados do `~/code/opex`
  (se houver) ou do `~/code/sipal/crm-marketing-campanhas`, sem alterar o restante da UI. Com o espaço
  aberto, o `<html>` troca `.dark` por `.light` (P48).
- **Onde vale**: todo o **espaço do negócio**, **portfólio público** (M5), **link do orçamento** (M3)
  e **e-mails** do negócio (orçamento).
- **Telas globais** (`/clientes`, `/negocios`, visão geral de trabalhos, administração, entrevista)
  usam sempre a **cor padrão do Ciliar (`#0B57C4`)** no modo escuro.

## 3. Atividades

| Campo | Regra |
|---|---|
| Nome | Obrigatório. |
| Descrição | Opcional. |
| Categoria | Texto livre com **sugestão** das categorias já usadas no negócio. |
| Valor por hora | Obrigatório, moeda do negócio, inteiro em centavos, ≥ 0. |
| Ativa | Inativa não aparece em novos pedidos; mantém o histórico. |

- **Histórico de preço**: toda alteração do valor/hora fica registrada (valor anterior, novo, data,
  ator) e é visível na atividade.
- **Valor congelado**: pedidos/trabalhos guardam o valor/hora da época; mudar a atividade não altera
  o que já existe.

## 4. Metas (somente faturamento bruto)

- **Uma meta ativa por negócio** (P59), com nome opcional, valor alvo (moeda do negócio) e período.
  - **Criar** uma meta: ela vira a atual e a anterior vai para o **histórico** (somente leitura, P60).
  - **Editar** a atual cria uma **nova versão**; a versão anterior fica no histórico (P61).
  - **Arquivar** a atual: a anterior (a substituída mais recente) volta a valer; sem anterior, o negócio
    fica sem meta (P62). **Restaurar** uma arquivada faz dela a atual.
  - Metas do histórico não podem ser editadas, arquivadas nem excluídas e não expiram; o prazo de
    exclusão automática vale só para as arquivadas.
  - A tela mostra a meta atual e, à direita, a **linha do tempo** (atual, novas versões, substituídas
    e arquivadas, com os períodos em que cada uma valeu).
- **Período**:
  - **Mês** ou **Ano**: **recorrente** (vale todo mês/ano, mostra o período corrente e o histórico)
    **ou** **específico** (ex.: março/2027, ano 2027) — o usuário escolhe.
  - **Hora** (valor médio por hora): o usuário escolhe a janela de medição — **mês**, **ano** ou
    **intervalo de datas**.
- **Faturamento bruto** = soma dos **valores recebidos** dos trabalhos em **Pago** e não arquivados,
  pela **data do pagamento** (M4).
- **Meta por hora** = faturamento bruto da janela ÷ **horas apontadas** (realizadas) nesses trabalhos.
  Sem horas apontadas, o progresso fica indisponível (não divide por zero).
- O mês/ano corrente segue o **fuso do navegador** do usuário; sem ele, `America/Sao_Paulo` (P50).

## 5. Documentos

| Campo | Regra |
|---|---|
| Nome | Obrigatório. |
| Arquivo | Storage S3, upload com PUT assinado (mesmo padrão do Agente Opex). |
| Categoria/tipo | Texto livre com sugestão das já usadas no negócio. |
| Descrição | Opcional. |
| Usar no portfólio | Marca o documento como publicável no Portfólio (M5). |

- **Limites configuráveis pelo admin** em Integrações › Plataforma: tamanho máximo por arquivo e
  tipos permitidos. Padrão: **25 MB** por arquivo; PDF, imagens, Office e texto; sem limite de
  quantidade.

## 6. Sucessos (cases/conquistas)

| Campo | Regra |
|---|---|
| Título | Obrigatório. |
| Descrição | Opcional. |
| Data | Opcional. |
| Resultado/métrica | Texto livre (ex.: "aumentou as vendas em 30%"). |
| Imagens/anexos | Arquivos no S3, mesmos limites dos documentos. |
| Cliente | **Entra com o M3** (vínculo a cliente cadastrado). |
| Trabalho | **Entra com o M4** (vínculo ao trabalho que originou o sucesso). |

## 7. Arquivamento e exclusão dos itens

Atividades, documentos, sucessos e metas seguem **o mesmo fluxo do negócio**: arquivar (some das
listas, pode restaurar), exclusão definitiva automática após o prazo e exclusão
definitiva manual de um item arquivado, com confirmação. Atividade arquivada não aparece em novos
pedidos; valores congelados em pedidos/trabalhos permanecem.

O **prazo de exclusão definitiva é configurado por tipo de item** em Integrações › Plataforma:
negócios, atividades, metas, documentos e sucessos têm cada um o seu (dias).

## 8. Transcrição da entrevista

Sem página no espaço do negócio (P55): fica disponível pela API (somente leitura) e pelo Agente Opex
(`get_business_interview`).

## 9. Permissões

Tudo sob `businesses.use` (próprios negócios) e `businesses.view_all` (suporte, **somente
leitura**: nunca altera dados de terceiros). Limites e prazos: `integrations.{plataforma}.edit`.

## 10. Agente Opex (ferramentas)

| Grupo | Ferramentas | Risco |
|---|---|---|
| Negócio | `update_business` (inclusive tema, contato, prazos e remover a logo) | write |
| | `set_business_logo` (imagem enviada no chat, P52) | write |
| Atividades | `list_activities`, `get_activity` (com histórico de preço) | read |
| | `create_activity`, `update_activity` | write |
| | `archive_activity`, `restore_activity`, `delete_activity` | destructive / write / destructive |
| Metas | `list_goals`, `get_current_goal`, `get_goal_progress` | read |
| | `create_goal`, `update_goal` | write |
| | `archive_goal`, `restore_goal`, `delete_goal` | destructive / write / destructive |
| Documentos | `list_documents`, `get_document` | read |
| | `create_document` (a partir de um arquivo enviado no chat, copiado para o negócio) | write |
| | `update_document` (metadados) | write |
| | `archive_document`, `restore_document`, `delete_document` | destructive / write / destructive |
| Sucessos | `list_successes`, `get_success` | read |
| | `create_success`, `update_success` | write |
| | `archive_success`, `restore_success`, `delete_success` | destructive / write / destructive |

Toda ferramenta recebe o negócio alvo e confere que o usuário real é o dono (ou tem
`businesses.view_all` para leitura). Anexos de sucessos também podem vir de arquivos do chat.

## 11. Auditoria

Criação, edição (com valor/hora anterior e novo), arquivamento, restauração e exclusão de todos os
itens; acessos de suporte.
