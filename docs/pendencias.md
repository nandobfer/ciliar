# Pendências

Decisões em aberto de todos os módulos. As resolvidas já estão incorporadas nos documentos de cada
módulo.

## Em aberto

Nenhuma pendência. Todos os módulos (M0–M5) estão definidos.

## Resolvidas

| # | Módulo | Decisão |
|---|---|---|
| P1 | M1 | Só é forçado à entrevista quem tem o escopo "Negócios" (`businesses.*`) em algum perfil e ainda não tem negócio. |
| P2 | M1 | Arquivados **não** contam no limite; restaurar exige vaga. |
| P3 | M1 | Moeda **BRL** por padrão, fora do roteiro padrão; editável depois. |
| P4 | M1 | O dono pode excluir definitivamente um arquivado antes do prazo automático (com confirmação). |
| P5 | M1 | Subtipo de PF/PJ (MEI, ME, EPP…) é texto livre definido/interpretado pelo agente. |
| P6 | M0 | Configurações da plataforma ficam em **Integrações** (novo item "Plataforma"). |
| P7 | M0 | Termos/política mantidos pelo admin no MongoDB, versionados, com ferramenta no Agente Opex. |
| P8 | M1 | Entrevista em andamento não expira. |
| P9 | M0 | Nova versão dos termos exige novo aceite: no próximo acesso, bloqueia até aceitar. |
| P10 | M1 | Descartar entrevista em andamento só é permitido a quem já tem outro negócio ativo. |
| P11 | M2 | Trocar a moeda só enquanto não houver pedidos/trabalhos; valores existentes não são convertidos (aviso). |
| P12 | M2 | Limites padrão de documentos: 25 MB por arquivo; PDF, imagens, Office e texto; sem limite de quantidade. |
| P13 | M2 | `businesses.view_all` é somente leitura. |
| P14 | M2 | O Agente Opex cria documento/anexo a partir de um arquivo do chat (`create_document`). |
| P15 | M2 | Prazo de exclusão definitiva configurável **por tipo de item** (negócios, atividades, metas, documentos, sucessos; clientes no M3). |
| P16 | M3 | Código sequencial por negócio (`PED-0001`), exibido no link e no card. |
| P17 | M3 | Status **Cancelado** a partir de Rascunho/Enviado, pelo prestador; revoga o link. |
| P18 | M3 | Recusado pode ser reaberto: volta a Rascunho (nova versão), recusa fica no histórico. |
| P19 | M3 | Validade padrão do link: 15 dias, configurável por negócio; editável por pedido. |
| P20 | M3 | Cada anexo tem "visível ao cliente" (padrão sim). |
| P21 | M3 | Token do link guardado cifrado para "Copiar link" a qualquer momento enquanto válido. |
| P22 | M3 | Novo campo "Contato comercial" (e-mail/telefone) opcional no negócio; e-mail da conta como padrão. |
| P23 | M4 | Visão geral: Kanban com as 4 fixas + "Outras etapas" agrupada; Tabela mostra a coluna real. |
| P24 | M4 | Arquivar trabalho em Pago **remove do faturamento** enquanto arquivado (com aviso). |
| P25 | M4 | Lançamento de horas tem descrição opcional. |
| P26 | M4 | Só o autor edita/exclui a própria nota, registrado na auditoria. |
| P27 | M2 | Tokens do modo claro copiados do `~/code/opex` (se houver) ou do `~/code/sipal/crm-marketing-campanhas`; o restante da UI não muda. |
| P28 | M5 | Slug sugerido a partir do nome do negócio; lista de reservados (`admin`, `api`, `login`, rotas existentes…). |
| P29 | M5 | Ao restaurar o negócio, o portfólio volta com o estado de publicação anterior. |
| P30 | M5 | Logo como favicon e imagem Open Graph, com nome e descrição do negócio. |
| — | M0 | Usuários atuais (inclusive admins) migram para Google com o mesmo e-mail, vínculo automático. |
