import { defineCatalog, type Catalog, type PermissionBranchDef } from "@nandobfer/perfix"
import { INTEGRATION_IDS } from "@/lib/integrations/catalog"
import { AI_AGENT_IDS, AI_AGENTS } from "@/features/ai/agents"
import { OPEX_TOOL_GROUP_LABELS, OPEX_TOOL_GROUPS, type OpexToolGroup } from "./constants"

/**
 * Catálogo das ferramentas do Agente Opex (módulo PURO: tela e servidor).
 *
 * Fonte única dos metadados de cada ferramenta: grupo, rótulo, descrição enviada ao modelo, risco e
 * as permissões Perfix exigidas. A implementação (`server/tools/<grupo>.ts`) só acrescenta a entrada
 * Zod e a execução; o teste `__tests__/features/opex-agent/tools.test.ts` garante que catálogo e
 * implementações andam juntos.
 *
 * ⚠️ Ao criar ou alterar uma funcionalidade, crie/atualize as ferramentas aqui e no grupo do
 * servidor (ver `AGENTS.md`). A seleção na configuração (Integrações › Provedores de IA › Agente
 * Opex) é montada a partir deste catálogo.
 */

/**
 * Padrão de confirmação pelo risco: `read` não pede; `write` pede na política "Toda alteração";
 * `destructive` pede. Cada ferramenta pode ter o padrão trocado na configuração (`confirmationOverrides`).
 */
export type OpexToolRisk = "read" | "write" | "destructive"

/** Permissões exigidas: todas as de `all` e, se houver, ao menos uma de `any`. */
export interface OpexToolAccess {
    all?: readonly string[]
    any?: readonly string[]
    /** Texto exibido quando a permissão depende da entrada (ex.: `integrations.{id}.edit`). */
    hint?: string
}

export interface OpexToolMeta {
    name: string
    group: OpexToolGroup
    /** Rótulo curto em pt-BR exibido no card da ferramenta e na configuração. */
    label: string
    /** Descrição enviada ao modelo (e exibida na configuração). */
    description: string
    risk: OpexToolRisk
    access: OpexToolAccess
    /** Sempre ligada (não aparece como desligável na configuração). */
    alwaysOn?: boolean
    /** Card especial no chat para a saída (ex.: token com botão de copiar). */
    display?: "api-token"
}

const ANY_INTEGRATION_VIEW = INTEGRATION_IDS.map((id) => `integrations.${id}.view`)
const AI_AGENT_LIST = AI_AGENT_IDS.map((id) => `${id} = ${AI_AGENTS[id].label}`).join("; ")

export const OPEX_TOOL_CATALOG: readonly OpexToolMeta[] = [
    // ── Contexto ──────────────────────────────────────────────────────────────
    {
        name: "get_app_overview",
        group: "context",
        label: "Visão geral",
        risk: "read",
        alwaysOn: true,
        access: {},
        description:
            "Retrato do acesso agora: data/hora, usuário real, simulação ativa (Visualizar como), perfis e permissões efetivas, e quantas ferramentas estão disponíveis por grupo. Bom primeiro passo quando o pedido for amplo.",
    },

    // ── Arquivos do chat ──────────────────────────────────────────────────────
    {
        name: "list_chat_files",
        group: "files",
        label: "Arquivos do chat",
        risk: "read",
        access: {},
        description: "Arquivos enviados nesta sessão do chat (fileId, nome, tipo, tamanho e se já foram enviados numa mensagem).",
    },
    {
        name: "read_chat_file",
        group: "files",
        label: "Ler arquivo",
        risk: "read",
        access: {},
        description: "Lê o conteúdo de texto de um arquivo do chat (txt, md, csv, json, código...), em janelas de até 100 mil caracteres. Use para arquivos grandes ou de mensagens antigas.",
    },

    // ── Documentação do app (aicontext, lida em tempo real) ─────────────────
    {
        name: "list_app_docs",
        group: "docs",
        label: "Listar documentação",
        risk: "read",
        access: {},
        description:
            "Documentos da documentação viva do Ciliar (regras de negócio de cada funcionalidade, lidas agora do disco) que o usuário pode consultar: caminho, título, seções e data da última alteração.",
    },
    {
        name: "read_app_doc",
        group: "docs",
        label: "Ler documentação",
        risk: "read",
        access: {},
        description:
            "Lê um documento da documentação viva do Ciliar (path de list_app_docs), inteiro ou só uma seção pelo título (section), em janelas de até 100 mil caracteres. Use para responder perguntas sobre como uma funcionalidade do app funciona.",
    },
    {
        name: "search_app_docs",
        group: "docs",
        label: "Buscar na documentação",
        risk: "read",
        access: {},
        description:
            "Busca por palavras-chave (sem diferença de acentos e maiúsculas) na documentação viva do Ciliar e devolve os trechos com documento, seção e linha. Primeiro passo para perguntas sobre regras, telas, fluxos, status e permissões do app.",
    },

    // ── Negócios (M1) ──────────────────────────────────────────────────────
    {
        name: "list_businesses",
        group: "businesses",
        label: "Listar negócios",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description:
            "Negócios do usuário (ativos e arquivados, com a data da exclusão definitiva automática) e as vagas do limite do perfil. Com businesses.view_all (suporte, somente leitura e auditado): os de outro usuário (ownerId) ou a busca por nome em todos (query).",
    },
    {
        name: "get_business",
        group: "businesses",
        label: "Ler negócio",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description: "Ficha completa de um negócio (tipo, subtipo, área, links, disponibilidade, moeda, logo e metas). De outro usuário, só com businesses.view_all (auditado).",
    },
    {
        name: "get_business_interview",
        group: "businesses",
        label: "Ler entrevista do negócio",
        risk: "read",
        access: { any: ["businesses.use", "businesses.view_all"] },
        description: "Transcrição da entrevista que criou o negócio e as respostas por pergunta do roteiro (versão usada).",
    },
    {
        name: "update_business",
        group: "businesses",
        label: "Editar negócio",
        risk: "write",
        access: { all: ["businesses.use", "businesses.edit"] },
        description:
            "Altera a ficha de um negócio ativo do próprio usuário: nome (vazio vira \"Negócio N\"), tipo PF/PJ, subtipo, área/segmento, descrição, links, disponibilidade, moeda (só sem pedidos/trabalhos; valores existentes não são convertidos), tema (cor primária #RRGGBB e modo dark/light), contato comercial (e-mail vazio = e-mail da conta; telefone), antecedência do alerta de prazo e validade padrão do link do orçamento (dias), e remover a logo (removeLogo). Só os campos informados mudam; links e disponibilidade substituem a lista inteira.",
    },
    {
        name: "archive_business",
        group: "businesses",
        label: "Arquivar negócio",
        risk: "destructive",
        access: { all: ["businesses.use", "businesses.archive"] },
        description: "Arquiva um negócio do usuário: some do seletor, deixa de contar no limite e é excluído definitivamente depois do prazo da Plataforma (pode ser restaurado antes).",
    },
    {
        name: "restore_business",
        group: "businesses",
        label: "Restaurar negócio",
        risk: "write",
        access: { all: ["businesses.use", "businesses.archive"] },
        description: "Restaura um negócio arquivado do usuário (exige vaga no limite de negócios ativos do perfil).",
    },
    {
        name: "delete_business",
        group: "businesses",
        label: "Excluir negócio definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "businesses.delete"] },
        description: "Exclui definitivamente um negócio ARQUIVADO do usuário, com atividades, metas, documentos, sucessos, entrevista e arquivos (irreversível).",
    },
    {
        name: "set_business_logo",
        group: "businesses",
        label: "Trocar logo do negócio",
        risk: "write",
        access: { all: ["businesses.use", "businesses.edit"] },
        description: "Troca a logo/foto de um negócio ativo do usuário por uma imagem PNG, JPEG, WebP ou GIF enviada no chat (fileId de list_chat_files), dentro do limite de tamanho da Plataforma. A anterior é removida.",
    },

    // ── Atividades do negócio (M2) ─────────────────────────────────────────
    {
        name: "list_activities",
        group: "business-activities",
        label: "Listar atividades",
        risk: "read",
        access: { any: ["activities.view", "businesses.view_all"] },
        description: "Atividades de um negócio (nome, categoria, valor por hora em unidades mínimas da moeda do negócio, ativa, arquivadas com a data da exclusão automática). Suporte (businesses.view_all) lê os de outros usuários, auditado.",
    },
    {
        name: "get_activity",
        group: "business-activities",
        label: "Ler atividade",
        risk: "read",
        access: { any: ["activities.view", "businesses.view_all"] },
        description: "Uma atividade com o histórico do valor por hora (anterior, novo, data e quem alterou).",
    },
    {
        name: "create_activity",
        group: "business-activities",
        label: "Criar atividade",
        risk: "write",
        access: { all: ["businesses.use", "activities.edit"] },
        description: "Cria uma atividade num negócio ativo do usuário: nome (obrigatório), descrição, categoria (texto livre; prefira as já usadas, vistas em list_activities), valor por hora em unidades mínimas (centavos, inteiro ≥ 0) e ativa.",
    },
    {
        name: "update_activity",
        group: "business-activities",
        label: "Editar atividade",
        risk: "write",
        access: { all: ["businesses.use", "activities.edit"] },
        description: "Edita uma atividade ativa: só os campos informados mudam. Mudar o valor por hora fica no histórico; pedidos e trabalhos existentes mantêm o valor da época. Inativa não aparece em novos pedidos.",
    },
    {
        name: "archive_activity",
        group: "business-activities",
        label: "Arquivar atividade",
        risk: "destructive",
        access: { all: ["businesses.use", "activities.edit"] },
        description: "Arquiva uma atividade (some das listas e de novos pedidos; excluída definitivamente após o prazo de atividades da Plataforma; pode ser restaurada antes).",
    },
    {
        name: "restore_activity",
        group: "business-activities",
        label: "Restaurar atividade",
        risk: "write",
        access: { all: ["businesses.use", "activities.edit"] },
        description: "Restaura uma atividade arquivada.",
    },
    {
        name: "delete_activity",
        group: "business-activities",
        label: "Excluir atividade definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "activities.delete"] },
        description: "Exclui definitivamente uma atividade ARQUIVADA, com o histórico de preço (irreversível; valores congelados em pedidos/trabalhos permanecem).",
    },

    // ── Metas do negócio (M2) ──────────────────────────────────────────────
    {
        name: "list_goals",
        group: "business-goals",
        label: "Listar metas",
        risk: "read",
        access: { any: ["goals.view", "businesses.view_all"] },
        description: "Metas de faturamento bruto de um negócio: a meta atual (uma por negócio) com o progresso (atingido × alvo) e a linha do tempo das anteriores (substituídas, somente leitura, e arquivadas), com os períodos em que cada uma foi a ativa. Fuso do usuário. Meta por hora sem horas apontadas: progresso indisponível.",
    },
    {
        name: "get_current_goal",
        group: "business-goals",
        label: "Meta atual",
        risk: "read",
        access: { any: ["goals.view", "businesses.view_all"] },
        description: "A meta ativa do negócio (ou nenhuma) com o progresso da janela corrente e o histórico das janelas das recorrentes.",
    },
    {
        name: "get_goal_progress",
        group: "business-goals",
        label: "Progresso da meta",
        risk: "read",
        access: { any: ["goals.view", "businesses.view_all"] },
        description: "Progresso de uma meta (atual ou da linha do tempo): janela corrente (ou a única, nas específicas/intervalo), situação (ativa, futura ou encerrada) e o histórico das janelas anteriores das recorrentes. Das metas fora de vigor, só até a última vez em que foram a ativa.",
    },
    {
        name: "create_goal",
        group: "business-goals",
        label: "Criar meta",
        risk: "write",
        access: { all: ["businesses.use", "goals.edit"] },
        description: "Define a NOVA meta atual de faturamento bruto (só uma meta ativa por negócio: a atual vai para a linha do tempo como substituída). Campos: nome opcional, alvo em unidades mínimas (centavos), período month/year (recorrente ou específico com month AAAA-MM / year) ou hour (valor médio por hora, com a janela measure month/year — recorrente ou específica — ou range com from/to). Confirme as escolhas com o usuário; não decida por ele.",
    },
    {
        name: "update_goal",
        group: "business-goals",
        label: "Editar meta",
        risk: "write",
        access: { all: ["businesses.use", "goals.edit"] },
        description: "Edita a meta ATUAL criando uma nova versão (mesmos campos de create_goal, todos informados); a versão anterior fica na linha do tempo. Sem mudança, nada é gravado. Metas do histórico são somente leitura. Devolve a nova versão (id novo).",
    },
    {
        name: "archive_goal",
        group: "business-goals",
        label: "Arquivar meta",
        risk: "destructive",
        access: { all: ["businesses.use", "goals.edit"] },
        description: "Arquiva a meta ATUAL: a substituída mais recente volta a ser a atual (ou o negócio fica sem meta). A arquivada é excluída definitivamente após o prazo de metas da Plataforma; pode ser restaurada antes.",
    },
    {
        name: "restore_goal",
        group: "business-goals",
        label: "Restaurar meta",
        risk: "write",
        access: { all: ["businesses.use", "goals.edit"] },
        description: "Restaura uma meta ARQUIVADA como a meta atual (a atual vai para a linha do tempo). Metas substituídas não podem ser restauradas.",
    },
    {
        name: "delete_goal",
        group: "business-goals",
        label: "Excluir meta definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "goals.delete"] },
        description: "Exclui definitivamente uma meta ARQUIVADA (irreversível). Metas substituídas ficam para sempre na linha do tempo.",
    },

    // ── Documentos do negócio (M2) ─────────────────────────────────────────
    {
        name: "list_documents",
        group: "business-documents",
        label: "Listar documentos",
        risk: "read",
        access: { any: ["documents.view", "businesses.view_all"] },
        description: "Documentos de um negócio (nome, categoria, descrição, se é usado no portfólio, arquivo e tamanho; arquivados com a data da exclusão automática).",
    },
    {
        name: "get_document",
        group: "business-documents",
        label: "Ler documento",
        risk: "read",
        access: { any: ["documents.view", "businesses.view_all"] },
        description: "Um documento com os metadados do arquivo.",
    },
    {
        name: "create_document",
        group: "business-documents",
        label: "Criar documento",
        risk: "write",
        access: { all: ["businesses.use", "documents.edit"] },
        description: "Cria um documento num negócio ativo do usuário a partir de um arquivo enviado no chat (fileId de list_chat_files): o arquivo é copiado para o negócio, respeitando o tamanho máximo e os tipos permitidos da Plataforma. Nome obrigatório; categoria (prefira as já usadas), descrição e usar no portfólio opcionais.",
    },
    {
        name: "update_document",
        group: "business-documents",
        label: "Editar documento",
        risk: "write",
        access: { all: ["businesses.use", "documents.edit"] },
        description: "Edita os metadados de um documento ativo (nome, categoria, descrição, usar no portfólio). Só os campos informados mudam.",
    },
    {
        name: "archive_document",
        group: "business-documents",
        label: "Arquivar documento",
        risk: "destructive",
        access: { all: ["businesses.use", "documents.edit"] },
        description: "Arquiva um documento (excluído definitivamente após o prazo de documentos da Plataforma; pode ser restaurado antes).",
    },
    {
        name: "restore_document",
        group: "business-documents",
        label: "Restaurar documento",
        risk: "write",
        access: { all: ["businesses.use", "documents.edit"] },
        description: "Restaura um documento arquivado.",
    },
    {
        name: "delete_document",
        group: "business-documents",
        label: "Excluir documento definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "documents.delete"] },
        description: "Exclui definitivamente um documento ARQUIVADO e o arquivo no storage (irreversível).",
    },

    // ── Sucessos do negócio (M2) ───────────────────────────────────────────
    {
        name: "list_successes",
        group: "business-successes",
        label: "Listar sucessos",
        risk: "read",
        access: { any: ["successes.view", "businesses.view_all"] },
        description: "Sucessos (cases/conquistas) de um negócio: título, descrição, data, resultado/métrica e anexos.",
    },
    {
        name: "get_success",
        group: "business-successes",
        label: "Ler sucesso",
        risk: "read",
        access: { any: ["successes.view", "businesses.view_all"] },
        description: "Um sucesso com os anexos.",
    },
    {
        name: "create_success",
        group: "business-successes",
        label: "Criar sucesso",
        risk: "write",
        access: { all: ["businesses.use", "successes.edit"] },
        description: "Cria um sucesso num negócio ativo do usuário: título (obrigatório), descrição, data (AAAA-MM-DD), resultado/métrica, cliente ligado (clientId de list_clients) e anexos a partir de arquivos enviados no chat (fileIds de list_chat_files; mesmos limites dos documentos).",
    },
    {
        name: "update_success",
        group: "business-successes",
        label: "Editar sucesso",
        risk: "write",
        access: { all: ["businesses.use", "successes.edit"] },
        description: "Edita um sucesso ativo: título, descrição, data, resultado e cliente ligado (só os informados mudam); addFileIds anexa arquivos do chat e removeAttachmentIds remove anexos atuais.",
    },
    {
        name: "archive_success",
        group: "business-successes",
        label: "Arquivar sucesso",
        risk: "destructive",
        access: { all: ["businesses.use", "successes.edit"] },
        description: "Arquiva um sucesso (excluído definitivamente após o prazo de sucessos da Plataforma; pode ser restaurado antes).",
    },
    {
        name: "restore_success",
        group: "business-successes",
        label: "Restaurar sucesso",
        risk: "write",
        access: { all: ["businesses.use", "successes.edit"] },
        description: "Restaura um sucesso arquivado.",
    },
    {
        name: "delete_success",
        group: "business-successes",
        label: "Excluir sucesso definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "successes.delete"] },
        description: "Exclui definitivamente um sucesso ARQUIVADO com os anexos (irreversível).",
    },

    // ── Clientes (M3) ──────────────────────────────────────────────────────────
    {
        name: "list_clients",
        group: "clients",
        label: "Listar clientes",
        risk: "read",
        access: { any: ["clients.view", "businesses.view_all"] },
        description: "Clientes do usuário (são do usuário, não do negócio: o mesmo cliente serve a todos os negócios). Filtros: busca por nome/e-mail/telefone, negócio (businessId: clientes com pedidos nele) e situação. Traz a quantidade de pedidos e os totais por moeda.",
    },
    {
        name: "get_client",
        group: "clients",
        label: "Ler cliente",
        risk: "read",
        access: { any: ["clients.view", "businesses.view_all"] },
        description: "Um cliente com contatos, observações privadas, os pedidos de todos os negócios e os totais por moeda (aceitos e abertos).",
    },
    {
        name: "create_client",
        group: "clients",
        label: "Criar cliente",
        risk: "write",
        access: { all: ["businesses.use", "clients.edit"] },
        description: "Cria um cliente: nome (obrigatório, pessoa ou empresa), e-mail e telefone/WhatsApp opcionais (o e-mail é necessário para enviar o orçamento por e-mail) e observações privadas (nunca aparecem no link do cliente).",
    },
    {
        name: "update_client",
        group: "clients",
        label: "Editar cliente",
        risk: "write",
        access: { all: ["businesses.use", "clients.edit"] },
        description: "Edita um cliente ativo: nome, e-mail, telefone e observações (só os informados mudam; vazio limpa).",
    },
    {
        name: "archive_client",
        group: "clients",
        label: "Arquivar cliente",
        risk: "destructive",
        access: { all: ["businesses.use", "clients.edit"] },
        description: "Arquiva um cliente (excluído definitivamente após o prazo de clientes da Plataforma, exceto se tiver pedidos: aí fica arquivado; pode ser restaurado).",
    },
    {
        name: "restore_client",
        group: "clients",
        label: "Restaurar cliente",
        risk: "write",
        access: { all: ["businesses.use", "clients.edit"] },
        description: "Restaura um cliente arquivado.",
    },
    {
        name: "delete_client",
        group: "clients",
        label: "Excluir cliente definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "clients.delete"] },
        description: "Exclui definitivamente um cliente ARQUIVADO e SEM pedidos (irreversível). Cliente com pedidos nunca é excluído.",
    },

    // ── Pedidos (M3) ───────────────────────────────────────────────────────────
    {
        name: "list_orders",
        group: "orders",
        label: "Listar pedidos",
        risk: "read",
        access: { any: ["orders.view", "businesses.view_all"] },
        description: "Pedidos (orçamentos) do usuário: de um negócio (businessId) ou de todos os negócios, com filtros por cliente e status (draft = Rascunho, sent = Enviado, accepted = Aceito, rejected = Recusado, cancelled = Cancelado). Traz código (PED-0001), título, cliente, valor, horas, prazo e o link (validade).",
    },
    {
        name: "get_order",
        group: "orders",
        label: "Ler pedido",
        risk: "read",
        access: { any: ["orders.view", "businesses.view_all"] },
        description: "Um pedido com a descrição, título/resumo (e se são manuais), itens (atividade, minutos e valor/hora congelado), total sugerido e ajustado, prazo, anexos (visível ao cliente), versões com o que mudou e as decisões (quem, nome, IP, data). Nunca devolve o token do link.",
    },
    {
        name: "create_order",
        group: "orders",
        label: "Criar pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.edit"] },
        description: "Cria um pedido em Rascunho num negócio ativo: cliente (clientId de list_clients ou newClient para cadastrar junto), necessidade (descrição livre, obrigatória), itens (activityId de uma atividade ATIVA + minutos estimados; o valor/hora é copiado agora), valor total ajustado opcional (unidades mínimas; sem ele, Σ horas × valor/hora), prazo de entrega (AAAA-MM-DD) e anexos de arquivos do chat. Título e resumo são gerados pela IA em segundo plano, salvo se informados.",
    },
    {
        name: "update_order",
        group: "orders",
        label: "Editar pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.edit"] },
        description: "Edita um pedido em Rascunho ou Enviado: cliente, descrição, título/resumo manuais (null devolve à IA), itens (lista COMPLETA: itens atuais pelo id de get_order + novos por activityId), valor ajustado (null volta ao calculado), prazo, anexos do chat a incluir e anexos atuais a remover ou mudar a visibilidade. Depois do primeiro envio, cada alteração gera uma versão; com o link ativo, o cliente vê a versão atual e o histórico.",
    },
    {
        name: "regenerate_order_title",
        group: "orders",
        label: "Gerar título do pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.edit"] },
        description: "Pede de novo à IA o título e o resumo do pedido (em segundo plano; o que for manual não muda).",
    },
    {
        name: "send_order",
        group: "orders",
        label: "Enviar pedido",
        risk: "destructive",
        access: { all: ["businesses.use", "orders.send"] },
        description: "Envia o orçamento (Rascunho → Enviado) ou renova a validade de um enviado: gera o link secreto do cliente (sem login; token novo se não houver link válido), validUntil opcional (padrão: a validade do negócio) e, com email: true, manda o e-mail ao cliente (exige e-mail do cliente e SMTP). Só devolve a URL do link com copyLink: true, quando o usuário pediu para copiá-la.",
    },
    {
        name: "revoke_order_link",
        group: "orders",
        label: "Revogar link do pedido",
        risk: "destructive",
        access: { all: ["businesses.use", "orders.send"] },
        description: "Revoga o link de um pedido Enviado (o cliente perde o acesso) e volta o pedido a Rascunho.",
    },
    {
        name: "accept_order",
        group: "orders",
        label: "Aceitar pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.decide"] },
        description: "Registra o aceite manual de um pedido Enviado (o cliente fechou fora do link): grava o ator e a cópia da versão e cria o Trabalho na coluna Abertura. Depois do aceite o pedido fica somente leitura.",
    },
    {
        name: "reject_order",
        group: "orders",
        label: "Recusar pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.decide"] },
        description: "Registra a recusa manual de um pedido Enviado, com motivo opcional.",
    },
    {
        name: "reopen_order",
        group: "orders",
        label: "Reabrir pedido",
        risk: "write",
        access: { all: ["businesses.use", "orders.decide"] },
        description: "Reabre um pedido Recusado: volta a Rascunho como nova versão (a recusa fica no histórico); para o cliente ver de novo, envie.",
    },
    {
        name: "cancel_order",
        group: "orders",
        label: "Cancelar pedido",
        risk: "destructive",
        access: { all: ["businesses.use", "orders.decide"] },
        description: "Cancela um pedido em Rascunho ou Enviado (desistência antes da decisão): revoga o link. Estado final.",
    },

    // ── Colunas dos trabalhos (M4) ────────────────────────────────────────────
    {
        name: "list_work_columns",
        group: "work-columns",
        label: "Listar colunas dos trabalhos",
        risk: "read",
        access: { any: ["works.view", "businesses.view_all"] },
        description: "Quadro de trabalhos de um negócio: as colunas na ordem (fixas Abertura, Execução, Validação e Pago, que nunca mudam, e as customizadas entre Abertura e Pago, com a chave col-…), a ordem (layout) e quantos trabalhos há em cada uma (arquivados inclusive).",
    },
    {
        name: "create_work_column",
        group: "work-columns",
        label: "Criar coluna dos trabalhos",
        risk: "write",
        access: { all: ["businesses.use", "works.columns"] },
        description: "Cria uma coluna customizada no quadro do negócio: nome, cor (violet, sky, emerald, amber, rose, cyan, orange, pink, lime, zinc), ícone e descrição opcional; afterKey = coluna depois da qual entra (sempre entre Abertura e Pago; sem afterKey, antes de Pago).",
    },
    {
        name: "update_work_column",
        group: "work-columns",
        label: "Editar coluna dos trabalhos",
        risk: "write",
        access: { all: ["businesses.use", "works.columns"] },
        description: "Renomeia ou muda cor, ícone e descrição de uma coluna customizada (as fixas não mudam).",
    },
    {
        name: "reorder_work_columns",
        group: "work-columns",
        label: "Reordenar colunas dos trabalhos",
        risk: "write",
        access: { all: ["businesses.use", "works.columns"] },
        description: "Nova ordem COMPLETA das colunas do quadro (chaves de list_work_columns): Abertura primeiro, Pago por último e Execução antes de Validação; as customizadas ficam em qualquer ponto entre elas.",
    },
    {
        name: "delete_work_column",
        group: "work-columns",
        label: "Excluir coluna dos trabalhos",
        risk: "destructive",
        access: { all: ["businesses.use", "works.columns"] },
        description: "Exclui uma coluna customizada VAZIA (sem trabalhos, inclusive arquivados). Com trabalhos, mova-os antes.",
    },

    // ── Trabalhos (M4) ───────────────────────────────────────────────────────
    {
        name: "list_works",
        group: "works",
        label: "Listar trabalhos",
        risk: "read",
        access: { any: ["works.view", "businesses.view_all"] },
        description: "Trabalhos (pedidos aceitos) do usuário: de um negócio (businessId) ou de todos, com filtros por cliente e situação (active, archived, all). Traz código do pedido, título, cliente, coluna (chave e nome), valor, prazo, horas estimadas × apontadas e o pagamento.",
    },
    {
        name: "get_work",
        group: "works",
        label: "Ler trabalho",
        risk: "read",
        access: { any: ["works.view", "businesses.view_all"] },
        description: "Um trabalho com os itens do pedido (itemId, atividade, minutos e valor/hora), valor, prazo, lançamentos de horas, notas, anexos, o pagamento e o histórico (pagamentos, movimentações e versões do pedido).",
    },
    {
        name: "move_work",
        group: "works",
        label: "Mover trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Move um trabalho ativo para outra coluna do quadro do negócio (chave de list_work_columns). Nunca para nem de Pago: para entrar em Pago use mark_work_paid; para sair, unmark_work_paid.",
    },
    {
        name: "mark_work_paid",
        group: "works",
        label: "Marcar trabalho como pago",
        risk: "write",
        access: { all: ["businesses.use", "works.payment"] },
        description: "Move o trabalho para Pago registrando o pagamento: data do pagamento (AAAA-MM-DD; padrão hoje, é a data do faturamento das metas), valor recebido (unidades mínimas; padrão o valor do pedido) e forma de pagamento (texto livre: PIX, transferência…). Num trabalho já pago, corrige o pagamento (o anterior fica no histórico).",
    },
    {
        name: "unmark_work_paid",
        group: "works",
        label: "Tirar trabalho de Pago",
        risk: "destructive",
        access: { all: ["businesses.use", "works.payment"] },
        description: "Tira o trabalho de Pago para outra coluna: remove-o do faturamento (metas e dashboard); o registro do pagamento fica no histórico.",
    },
    {
        name: "update_work",
        group: "works",
        label: "Editar trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Edita os dados comerciais do trabalho: itens (lista COMPLETA: os atuais pelo itemId de get_work, com os minutos estimados, + novos por activityId de uma atividade ATIVA), valor ajustado (null volta ao calculado) e prazo (AAAA-MM-DD). Altera o pedido aceito com uma versão no histórico; o link do cliente continua mostrando a versão aceita.",
    },
    {
        name: "archive_work",
        group: "works",
        label: "Arquivar trabalho",
        risk: "destructive",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Arquiva um trabalho desistido/cancelado após o aceite (some do Kanban/Tabela; excluído definitivamente após o prazo de Trabalhos da Plataforma). Um trabalho em Pago arquivado SAI do faturamento enquanto estiver arquivado.",
    },
    {
        name: "restore_work",
        group: "works",
        label: "Restaurar trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Restaura um trabalho arquivado na mesma coluna; se estava em Pago, volta a contar no faturamento com o pagamento registrado.",
    },
    {
        name: "delete_work",
        group: "works",
        label: "Excluir trabalho definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "works.delete"] },
        description: "Exclui definitivamente um trabalho ARQUIVADO com horas, notas, anexos e movimentações (irreversível). O pedido continua Aceito como registro e o sucesso ligado perde o vínculo.",
    },

    // ── Horas dos trabalhos (M4) ──────────────────────────────────────────────
    {
        name: "list_time_entries",
        group: "work-time",
        label: "Listar horas do trabalho",
        risk: "read",
        access: { any: ["works.view", "businesses.view_all"] },
        description: "Lançamentos de horas de um trabalho: item/atividade, valor/hora congelado, data, minutos, descrição e autor.",
    },
    {
        name: "create_time_entry",
        group: "work-time",
        label: "Lançar horas",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Lança horas realizadas num trabalho ativo (apontamento manual, sem cronômetro): source orderItem + refId = itemId de get_work, ou source activity + refId = id de uma atividade ATIVA do negócio fora do pedido (o valor/hora é congelado agora); data trabalhada (AAAA-MM-DD, não futura), minutos (1 a 1440) e descrição opcional.",
    },
    {
        name: "update_time_entry",
        group: "work-time",
        label: "Editar lançamento de horas",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Edita um lançamento de horas (só os campos informados mudam; trocar o item/atividade congela o valor/hora novo).",
    },
    {
        name: "delete_time_entry",
        group: "work-time",
        label: "Excluir lançamento de horas",
        risk: "destructive",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Exclui um lançamento de horas do trabalho (irreversível).",
    },

    // ── Notas, anexos e sucesso dos trabalhos (M4) ─────────────────────────────
    {
        name: "add_work_note",
        group: "work-notes",
        label: "Adicionar nota ao trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Adiciona uma nota/comentário interno ao trabalho (o autor é o usuário; nunca aparece ao cliente).",
    },
    {
        name: "update_work_note",
        group: "work-notes",
        label: "Editar nota do trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Edita uma nota do trabalho — somente uma nota de autoria do próprio usuário.",
    },
    {
        name: "delete_work_note",
        group: "work-notes",
        label: "Excluir nota do trabalho",
        risk: "destructive",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Exclui uma nota do trabalho — somente uma nota de autoria do próprio usuário.",
    },
    {
        name: "add_work_attachment",
        group: "work-notes",
        label: "Anexar arquivo ao trabalho",
        risk: "write",
        access: { all: ["businesses.use", "works.edit"] },
        description: "Anexa ao trabalho (entregáveis) arquivos enviados no chat (fileIds de list_chat_files; mesmos limites dos documentos).",
    },
    {
        name: "convert_work_to_success",
        group: "work-notes",
        label: "Converter trabalho em sucesso",
        risk: "write",
        access: { all: ["businesses.use", "works.edit", "successes.edit"] },
        description: "Cria um Sucesso do negócio ligado ao trabalho e ao cliente (um por trabalho): título (padrão: o título do pedido), descrição, data (padrão: a do pagamento ou hoje) e resultado/métrica.",
    },

    // ── Portfólio (M5) ────────────────────────────────────────────────────────
    {
        name: "get_portfolio_page",
        group: "portfolio",
        label: "Ler página do portfólio",
        risk: "read",
        access: { any: ["portfolio.view", "businesses.view_all"] },
        description:
            "Página do portfólio público de um negócio (editor de blocos): endereço (slug e URL), página publicada ou não, indexação, os blocos do RASCUNHO (id, tipo e propriedades, inclusive os de dentro das colunas), se há alterações não publicadas e os problemas que impedem publicar, o conteúdo disponível (sucessos, serviços, documentos e itens avulsos com id), a mídia e o histórico de publicações. Cabeçalho e contato são fixos (Ficha do negócio).",
    },
    {
        name: "add_portfolio_block",
        group: "portfolio",
        label: "Adicionar bloco ao portfólio",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description:
            "Adiciona um bloco ao rascunho da página: heading (text, level 2|3), text (markdown: negrito, itálico, links e listas), image (mediaId da mídia, alt obrigatório para publicar, caption, width contained|full), gallery (mediaIds, layout grid|carousel, columns 2-4), button (label, action whatsapp|email|phone|link, url para link, variant solid|outline), testimonial (quote, author, role, photoId), separator (variant line|space, size sm|md|lg), columns (ratio 50-50|33-67|67-33|33-33-33), section (source services|successes|documents|items, title, mode picked|all, picks [{id, showClient}], sort manual|newest|oldest|name, limit, layout grid|list|carousel, columns 2|3, showClient) e featured (source, refId, showClient). Estilo em style {background none|subtle|primary, spacing sm|md|lg, align left|center}. parentId+column põe dentro de um bloco Colunas (só blocos simples: sem colunas nem seções). Só muda o rascunho.",
    },
    {
        name: "update_portfolio_block",
        group: "portfolio",
        label: "Editar bloco do portfólio",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Altera as propriedades de um bloco do rascunho (só as informadas mudam; o tipo não muda). Em colunas, ratio reorganiza as colunas.",
    },
    {
        name: "move_portfolio_block",
        group: "portfolio",
        label: "Mover bloco do portfólio",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Move um bloco do rascunho: para cima/baixo (delta -1|1) ou para uma posição (index na página, ou parentId+column+index dentro de um bloco Colunas).",
    },
    {
        name: "remove_portfolio_block",
        group: "portfolio",
        label: "Remover bloco do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Remove um bloco do rascunho (um bloco Colunas sai com os blocos de dentro). A página publicada só muda ao publicar as alterações.",
    },
    {
        name: "apply_portfolio_template",
        group: "portfolio",
        label: "Aplicar modelo ao portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Substitui os blocos do rascunho por um modelo pronto montado com o conteúdo disponível: classic (Clássico), showcase (Vitrine), minimal (Minimalista) ou blank (em branco).",
    },
    {
        name: "discard_portfolio_draft",
        group: "portfolio",
        label: "Descartar rascunho do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Descarta as alterações não publicadas: o rascunho volta a ser igual à página publicada.",
    },
    {
        name: "restore_portfolio_publication",
        group: "portfolio",
        label: "Restaurar publicação do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Restaura uma publicação antiga (number do histórico de get_portfolio_page) como rascunho, substituindo os blocos atuais do rascunho. A página publicada só muda ao publicar.",
    },
    {
        name: "publish_portfolio_changes",
        group: "portfolio",
        label: "Publicar alterações do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.publish"] },
        description: "Publica o rascunho: os blocos passam a ser a página pública (entra no histórico). Com publishPage true também liga a página, se estiver desligada. Recusado se houver problemas (ex.: imagem sem texto alternativo). Devolve a URL.",
    },
    {
        name: "list_portfolio_media",
        group: "portfolio",
        label: "Listar mídia do portfólio",
        risk: "read",
        access: { any: ["portfolio.view", "businesses.view_all"] },
        description: "Imagens da mídia do portfólio (id, nome, tipo), usadas nos blocos Imagem, Galeria e Depoimento.",
    },
    {
        name: "add_portfolio_media",
        group: "portfolio",
        label: "Adicionar mídia ao portfólio",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Copia imagens enviadas no chat (fileIds de list_chat_files; PNG, JPEG, WebP ou GIF) para a mídia do portfólio. Devolve os ids para usar nos blocos.",
    },
    {
        name: "delete_portfolio_media",
        group: "portfolio",
        label: "Excluir mídia do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Exclui definitivamente uma imagem da mídia (recusado se estiver em uso no rascunho ou na página publicada).",
    },
    {
        name: "update_portfolio_settings",
        group: "portfolio",
        label: "Configurar portfólio",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.publish"] },
        description: "Permite ou não a indexação da página pelos buscadores (padrão: noindex).",
    },
    {
        name: "publish_portfolio",
        group: "portfolio",
        label: "Publicar portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.publish"] },
        description: "Liga a página /p/[slug] (pública, sem login) com a última versão publicada dos blocos. Para publicar o rascunho use publish_portfolio_changes. Devolve a URL.",
    },
    {
        name: "unpublish_portfolio",
        group: "portfolio",
        label: "Despublicar portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.publish"] },
        description: "Desliga a página: o endereço passa a responder 404 (os blocos, o rascunho e o endereço ficam guardados).",
    },
    {
        name: "update_portfolio_slug",
        group: "portfolio",
        label: "Trocar endereço do portfólio",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.publish"] },
        description: "Troca o endereço (slug) do portfólio: único na plataforma, minúsculas, números e hífen, sem palavras reservadas. O endereço antigo deixa de funcionar na hora (sem redirecionamento).",
    },
    {
        name: "list_portfolio_items",
        group: "portfolio-items",
        label: "Listar itens avulsos",
        risk: "read",
        access: { any: ["portfolio.view", "businesses.view_all"] },
        description: "Itens avulsos do portfólio de um negócio (projetos só para o portfólio): título, descrição, imagens, link, data e categorias/tags; arquivados com a data da exclusão automática.",
    },
    {
        name: "create_portfolio_item",
        group: "portfolio-items",
        label: "Criar item avulso",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Cria um item avulso no portfólio de um negócio ativo: título (obrigatório), descrição, link externo, data (AAAA-MM-DD), categorias/tags (prefira as já usadas) e imagens a partir de arquivos do chat (fileIds de list_chat_files; PNG, JPEG, WebP ou GIF, até 20).",
    },
    {
        name: "update_portfolio_item",
        group: "portfolio-items",
        label: "Editar item avulso",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Edita um item avulso ativo (só os campos informados mudam); addFileIds acrescenta imagens do chat e removeImageIds remove imagens atuais.",
    },
    {
        name: "archive_portfolio_item",
        group: "portfolio-items",
        label: "Arquivar item avulso",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Arquiva um item avulso: sai do portfólio público e é excluído definitivamente após o prazo dos itens avulsos da Plataforma (pode ser restaurado antes).",
    },
    {
        name: "restore_portfolio_item",
        group: "portfolio-items",
        label: "Restaurar item avulso",
        risk: "write",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Restaura um item avulso arquivado (volta ao portfólio).",
    },
    {
        name: "delete_portfolio_item",
        group: "portfolio-items",
        label: "Excluir item avulso definitivamente",
        risk: "destructive",
        access: { all: ["businesses.use", "portfolio.edit"] },
        description: "Exclui definitivamente um item avulso ARQUIVADO com as imagens (irreversível).",
    },

    // ── Memórias dos agentes ──────────────────────────────────────────────────
    {
        name: "list_agent_memories",
        group: "memories",
        label: "Listar memórias",
        risk: "read",
        access: { all: ["ai_memories.view"] },
        description: `Memórias (instruções permanentes) de um agente de IA (${AI_AGENT_LIST}), com id, resumo, texto, autor e datas. Sem agent, lista as de todos os agentes.`,
    },
    {
        name: "get_agent_memory",
        group: "memories",
        label: "Ler memória",
        risk: "read",
        access: { all: ["ai_memories.view"] },
        description: "Uma memória de um agente (texto completo, resumo, autor e datas).",
    },
    {
        name: "create_agent_memory",
        group: "memories",
        label: "Criar memória",
        risk: "write",
        access: { all: ["ai_memories.edit"] },
        description: `Cria uma memória (instrução ou fato permanente, de 3 a 2.000 caracteres) para um agente de IA (${AI_AGENT_LIST}), inclusive você mesmo. O texto é revisado e resumido pelo uso "Resumo" (formattedByAi=false quando ele está indisponível). Até 50 por agente.`,
    },
    {
        name: "update_agent_memory",
        group: "memories",
        label: "Editar memória",
        risk: "write",
        access: { all: ["ai_memories.edit"] },
        description: "Substitui o texto de uma memória de um agente (revisado e resumido de novo pelo Resumo).",
    },
    {
        name: "delete_agent_memory",
        group: "memories",
        label: "Excluir memória",
        risk: "destructive",
        access: { all: ["ai_memories.edit"] },
        description: "Exclui uma memória de um agente: ele deixa de segui-la a partir da próxima resposta.",
    },

    // ── Usuários ──────────────────────────────────────────────────────────────
    {
        name: "list_users",
        group: "users",
        label: "Listar usuários",
        risk: "read",
        access: { all: ["users.view"] },
        description: "Usuários do painel (id, nome, e-mail, ativo, perfis, se você pode gerenciá-lo, convite pendente, último acesso e versão dos termos aceita), com busca opcional por nome/e-mail e filtro de situação.",
    },
    {
        name: "get_user",
        group: "users",
        label: "Ler usuário",
        risk: "read",
        access: { all: ["users.view"] },
        description: "Um usuário (por id ou e-mail) com os perfis e as permissões efetivas resultantes.",
    },
    {
        name: "create_user",
        group: "users",
        label: "Cadastrar usuário",
        risk: "destructive",
        access: { all: ["users.create"] },
        description:
            "Pré-cadastra (convida) um usuário com nome, e-mail da conta Google, situação e perfis (ids de list_roles). Não há senha: a pessoa entra com o Google usando esse e-mail e recebe os perfis do convite. Opcionalmente envia o convite por e-mail (SMTP configurado).",
    },
    {
        name: "resend_user_invite",
        group: "users",
        label: "Reenviar convite",
        risk: "write",
        access: { all: ["users.create"] },
        description: "Reenvia por e-mail o convite de um usuário ativo que ainda não entrou com o Google (exige o SMTP configurado).",
    },
    {
        name: "update_user",
        group: "users",
        label: "Editar usuário",
        risk: "destructive",
        access: { all: ["users.edit"] },
        description: "Altera nome, situação (ativo/inativo) e/ou perfis de um usuário. Só os campos informados mudam. Não é possível alterar os próprios perfis nem desativar a própria conta.",
    },
    {
        name: "delete_user",
        group: "users",
        label: "Excluir usuário",
        risk: "destructive",
        access: { all: ["users.delete"] },
        description: "Exclui um usuário (não é possível excluir a própria conta nem o último administrador ativo).",
    },

    // ── Perfis ────────────────────────────────────────────────────────────────
    {
        name: "list_permission_catalog",
        group: "roles",
        label: "Catálogo de permissões",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Árvore de permissões do painel (chave, rótulo e se é sensível), para montar ou explicar perfis.",
    },
    {
        name: "list_roles",
        group: "roles",
        label: "Listar perfis",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Perfis na ordem da hierarquia (id, nome, descrição, cor, ativo, posição e quantidade de permissões).",
    },
    {
        name: "get_role",
        group: "roles",
        label: "Ler perfil",
        risk: "read",
        access: { all: ["roles.view"] },
        description: "Um perfil (por id ou nome) com as permissões e, se você puder ver usuários, os membros.",
    },
    {
        name: "create_role",
        group: "roles",
        label: "Criar perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Cria um perfil com nome, descrição, cor (nome da paleta: roxo, azul, verde…), situação, permissões (chaves de list_permission_catalog) e limite de negócios ativos (null = ilimitado). Só concede permissões que você mesmo possui.",
    },
    {
        name: "update_role",
        group: "roles",
        label: "Editar perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description:
            "Altera nome, descrição, cor, situação, limite de negócios ativos (null = ilimitado), permissões e/ou membros (ids de usuários; exige também users.edit) de um perfil. Só os campos informados mudam; permissões e membros substituem a lista inteira.",
    },
    {
        name: "reorder_roles",
        group: "roles",
        label: "Reordenar perfis",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Define a ordem da hierarquia dos perfis (lista completa de ids, sem o Administrador, que fica sempre no topo).",
    },
    {
        name: "delete_role",
        group: "roles",
        label: "Excluir perfil",
        risk: "destructive",
        access: { all: ["roles.edit"] },
        description: "Exclui um perfil sem membros (o Administrador não pode ser excluído).",
    },

    // ── Integrações ───────────────────────────────────────────────────────────
    {
        name: "list_integrations",
        group: "integrations",
        label: "Listar integrações",
        risk: "read",
        access: { any: ANY_INTEGRATION_VIEW, hint: "integrations.{id}.view" },
        description: "Integrações que você pode ver, com situação (configurada, saúde do último teste, modo debug).",
    },
    {
        name: "get_integration",
        group: "integrations",
        label: "Ler integração",
        risk: "read",
        access: { any: ANY_INTEGRATION_VIEW, hint: "integrations.{id}.view" },
        description:
            "Configuração de uma integração: valores públicos, quais segredos estão definidos (nunca o valor), saúde e a definição dos campos (chaves e tipos para update_integration).",
    },
    {
        name: "update_integration",
        group: "integrations",
        label: "Configurar integração",
        risk: "destructive",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.edit`), hint: "integrations.{id}.edit" },
        description:
            "Altera campos públicos, segredos (gravar ou limpar), ambiente ou modo debug de uma integração. Os campos são validados pela definição da integração (veja get_integration). Os crons ficam no campo `jobs` da integração `crons`.",
    },
    {
        name: "test_integration",
        group: "integrations",
        label: "Testar integração",
        risk: "read",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.test`), hint: "integrations.{id}.test" },
        description: "Executa o teste de conexão da integração e devolve o resultado com o log do teste.",
    },
    {
        name: "list_integration_logs",
        group: "integrations",
        label: "Logs da integração",
        risk: "read",
        access: { any: INTEGRATION_IDS.map((id) => `integrations.${id}.logs`), hint: "integrations.{id}.logs" },
        description: "Últimas linhas do log de uma integração (mascaradas), com filtro opcional de texto.",
    },

    // ── Tokens da API interna ─────────────────────────────────────────────────
    {
        name: "list_api_tokens",
        group: "api-tokens",
        label: "Listar tokens",
        risk: "read",
        access: { all: ["integrations.internal_api.tokens"] },
        description: "Tokens de sistema ativos da API interna (id, nome, prefixo visível, criação e último uso; nunca o valor).",
    },
    {
        name: "create_api_token",
        group: "api-tokens",
        label: "Gerar token",
        risk: "destructive",
        access: { all: ["integrations.internal_api.tokens"] },
        display: "api-token",
        description:
            "Gera um token de sistema da API interna. O valor é exibido uma única vez num card com botão de copiar para o usuário; não repita o valor no texto da resposta.",
    },
    {
        name: "revoke_api_token",
        group: "api-tokens",
        label: "Revogar token",
        risk: "destructive",
        access: { all: ["integrations.internal_api.tokens"] },
        description: "Revoga um token de sistema da API interna (o acesso por ele para na hora).",
    },

    // ── Rotinas ───────────────────────────────────────────────────────────────
    {
        name: "list_routines",
        group: "routines",
        label: "Listar rotinas",
        risk: "read",
        access: { all: ["integrations.crons.view"] },
        description:
            "Rotinas (crons) do agendador interno: configuração (id, agenda, ativa) e estado (última e próxima execução). Para alterar, use update_integration na integração `crons` (campo `jobs`, a lista inteira).",
    },
    {
        name: "run_routine",
        group: "routines",
        label: "Rodar rotina",
        risk: "write",
        access: { all: ["integrations.crons.run"] },
        description: "Executa agora uma rotina salva (não muda a próxima execução agendada).",
    },

    // ── Plataforma ────────────────────────────────────────────────────────────
    {
        name: "get_platform_settings",
        group: "platform",
        label: "Ler configuração da plataforma",
        risk: "read",
        access: { all: ["integrations.platform.view"] },
        description:
            "Configuração da plataforma: perfil padrão do cadastro público (e se o cadastro está disponível), perfis elegíveis, dias até a exclusão definitiva por tipo de item arquivado, limites de documentos e a versão vigente dos termos.",
    },
    {
        name: "update_platform_settings",
        group: "platform",
        label: "Configurar a plataforma",
        risk: "destructive",
        access: { all: ["integrations.platform.edit"] },
        description:
            "Altera o perfil padrão do cadastro público (autoridade: nunca o Administrador, só perfis ativos que você pode atribuir; null desativa o cadastro público), os prazos de exclusão definitiva por tipo e/ou os limites de documentos. Só os campos informados mudam.",
    },
    {
        name: "get_legal_terms",
        group: "platform",
        label: "Ler termos e privacidade",
        risk: "read",
        access: { all: ["integrations.platform.view"] },
        description: "Termos de uso e política de privacidade: versão vigente (ou uma versão específica) com os textos em markdown e o histórico de publicações.",
    },
    {
        name: "update_legal_terms",
        group: "platform",
        label: "Publicar termos e privacidade",
        risk: "destructive",
        access: { all: ["integrations.platform.edit"] },
        description:
            "Publica uma nova versão (imutável) dos termos de uso e/ou da política de privacidade; o texto omitido é mantido da versão vigente. Todos os usuários, inclusive você, ficam bloqueados até aceitar a nova versão no próximo acesso.",
    },
]

const BY_NAME = new Map(OPEX_TOOL_CATALOG.map((tool) => [tool.name, tool]))

export const OPEX_TOOL_NAMES = OPEX_TOOL_CATALOG.map((tool) => tool.name)

export function opexToolMeta(name: string): OpexToolMeta | undefined {
    return BY_NAME.get(name)
}

export function isOpexToolName(name: string): boolean {
    return BY_NAME.has(name)
}

/** Ferramentas sempre ligadas (o contexto). */
export const OPEX_ALWAYS_ON_TOOLS = new Set(OPEX_TOOL_CATALOG.filter((tool) => tool.alwaysOn).map((tool) => tool.name))

const has = (permissions: ReadonlySet<string>, key: string) => permissions.has("*") || permissions.has(key)

/** Grupos do prestador: não exigem o painel. Os demais (administração) exigem também `admin.access`. */
export const OPEX_NO_PANEL_GROUPS: ReadonlySet<OpexToolGroup> = new Set<OpexToolGroup>(["context", "files", "docs", "businesses", "business-activities", "business-goals", "business-documents", "business-successes", "clients", "orders", "work-columns", "works", "work-time", "work-notes", "portfolio", "portfolio-items"])

/** As permissões efetivas liberam a ferramenta? (Revalidado no servidor antes de cada execução.) */
export function canUseOpexTool(meta: Pick<OpexToolMeta, "access" | "group">, permissions: ReadonlySet<string>): boolean {
    if (!OPEX_NO_PANEL_GROUPS.has(meta.group) && !has(permissions, "admin.access")) return false
    const { all = [], any } = meta.access
    if (!all.every((key) => has(permissions, key))) return false
    return !any?.length || any.some((key) => has(permissions, key))
}

/** Confirmação padrão de uma ferramenta pelo risco e pela política geral. */
export function defaultToolConfirms(risk: OpexToolRisk, policy: "destructive" | "writes"): boolean {
    return risk === "destructive" || (policy === "writes" && risk === "write")
}

/** A ferramenta pede confirmação? O ajuste da ferramenta vence o padrão do risco. */
export function toolConfirms(meta: Pick<OpexToolMeta, "name" | "risk">, policy: "destructive" | "writes", overrides: Readonly<Record<string, boolean>> = {}): boolean {
    const override = overrides[meta.name]
    return typeof override === "boolean" ? override : defaultToolConfirms(meta.risk, policy)
}

/** Permissões exigidas, para exibir na configuração. */
export function opexToolPermissionLabel(meta: Pick<OpexToolMeta, "access">): string | null {
    if (meta.access.hint) return meta.access.hint
    return meta.access.all?.length ? meta.access.all.join(" + ") : null
}

/** Ferramentas ligadas a partir das desligadas guardadas (as sempre ligadas nunca saem). */
export function enabledOpexToolNames(disabledTools: readonly string[]): string[] {
    const disabled = new Set(disabledTools)
    return OPEX_TOOL_NAMES.filter((name) => OPEX_ALWAYS_ON_TOOLS.has(name) || !disabled.has(name))
}

/** Desligadas a partir das marcadas na árvore (nomes desconhecidos e sempre ligadas são ignorados). */
export function disabledOpexToolNames(enabled: Iterable<string>): string[] {
    const on = new Set(enabled)
    return OPEX_TOOL_NAMES.filter((name) => !OPEX_ALWAYS_ON_TOOLS.has(name) && !on.has(name))
}

/**
 * Árvore da seleção de ferramentas, no mesmo formato das permissões de perfis: um módulo por grupo,
 * uma folha por ferramenta. Destrutivas aparecem como sensíveis (borda âmbar). Sem `viewKey`: marcar
 * uma ferramenta não liga outra.
 */
export const OPEX_TOOL_TREE: readonly PermissionBranchDef[] = OPEX_TOOL_GROUPS.map((group) => ({
    id: `tools_${group}`,
    label: OPEX_TOOL_GROUP_LABELS[group].label,
    description: OPEX_TOOL_GROUP_LABELS[group].description,
    children: OPEX_TOOL_CATALOG.filter((tool) => tool.group === group).map((tool) => ({
        key: tool.name,
        label: tool.label,
        description: tool.description,
        ...(tool.risk === "destructive" ? { sensitive: true } : {}),
    })),
})).filter((branch) => branch.children.length > 0)

// Árvore montada em tempo de execução: sem tipos literais das chaves (evita a inferência recursiva do Perfix).
const defineToolCatalog = defineCatalog as unknown as (tree: readonly PermissionBranchDef[]) => Catalog
export const opexToolTreeCatalog = defineToolCatalog(OPEX_TOOL_TREE)
