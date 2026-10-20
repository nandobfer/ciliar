# M2 — Espaço do negócio

Núcleo de cada negócio. Só o dono acessa (e quem tem `businesses.view_all`, auditado). Tudo que a
tela faz também é feito pelo **Agente Opex** com ferramentas.

## 1. Página inicial: Dashboard

- Progresso das metas ativas (atingido × alvo).
- Trabalhos por coluna do Kanban (quando o M4 existir).
- Faturamento recente (trabalhos em "Pago", quando o M4 existir).
- Até M3/M4, o dashboard mostra só as metas (com progresso zero) e atalhos do espaço.

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
| Contato comercial | E-mail e telefone, opcionais; e-mail da conta como padrão. Exibido no link do orçamento (M3). |
| Antecedência do alerta de prazo | Dias; padrão 3 (M3). |
| Validade padrão do link do orçamento | Dias; padrão 15 (M3). |

Todos os campos nativos podem ser perguntas do roteiro do Entrevistador (M1), inclusive Descrição.
Arquivar/restaurar/excluir seguem o M1. A **moeda** só pode ser trocada enquanto o negócio não tiver
pedidos/trabalhos; valores já cadastrados (atividades, metas) **não são convertidos** e a tela avisa.

## 2.1 Tema do negócio

Cada negócio define sua **cor primária** e o **modo claro/escuro** (padrão: `#0B57C4`, escuro).
Referência de implementação: `~/code/sipal/crm-marketing-campanhas/src/lib/companies/theme.ts`.

- Sobrescreve `--primary`, `--primary-foreground`, `--ring` e os tokens derivados da sidebar no
  contêiner do layout do negócio **e** como regra `:root` (para diálogos, popovers, tooltips e toasts
  renderizados no `<body>`).
- Foreground escolhido por **contraste WCAG ≥ 4,5:1** (branco ou quase-preto); cor inválida ou sem
  contraste cai na cor padrão do Ciliar (`#0B57C4`).
- Valores CSS gerados **somente** a partir da cor validada (nunca do texto digitado): sem injeção de CSS.
- Pré-visualização ao vivo na edição.
- **Modo claro**: o Ciliar só tem tokens escuros; os tokens claros são copiados do `~/code/opex`
  (se houver) ou do `~/code/sipal/crm-marketing-campanhas`, sem alterar o restante da UI.
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

- **Várias metas livres** por negócio, cada uma com nome opcional, valor alvo (moeda do negócio) e
  período.
- **Período**:
  - **Mês** ou **Ano**: **recorrente** (vale todo mês/ano, mostra o período corrente e o histórico)
    **ou** **específico** (ex.: março/2027, ano 2027) — o usuário escolhe.
  - **Hora** (valor médio por hora): o usuário escolhe a janela de medição — **mês**, **ano** ou
    **intervalo de datas**.
- **Faturamento bruto** = soma dos **valores recebidos** dos trabalhos em **Pago** e não arquivados,
  pela **data do pagamento** (M4).
- **Meta por hora** = faturamento bruto da janela ÷ **horas apontadas** (realizadas) nesses trabalhos.
  Sem horas apontadas, o progresso fica indisponível (não divide por zero).

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

Visível ao dono (somente leitura) no espaço do negócio.

## 9. Permissões

Tudo sob `businesses.use` (próprios negócios) e `businesses.view_all` (suporte, **somente
leitura**: nunca altera dados de terceiros). Limites e prazos: `integrations.{plataforma}.edit`.

## 10. Agente Opex (ferramentas)

| Grupo | Ferramentas | Risco |
|---|---|---|
| Negócio | `update_business` | write |
| Atividades | `list_activities`, `get_activity` (com histórico de preço) | read |
| | `create_activity`, `update_activity` | write |
| | `archive_activity`, `restore_activity`, `delete_activity` | destructive / write / destructive |
| Metas | `list_goals`, `get_goal_progress` | read |
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
