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
| P31 | M0 | Credenciais OAuth do Google no ambiente (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`): o login precede a tela de Integrações. |
| P32 | M0 | Termos de uso e política de privacidade formam **uma versão conjunta**, com um único aceite. |
| P33 | M0 | Sem versão publicada, o cadastro público fica indisponível e ninguém é bloqueado; a primeira publicação passa a exigir o aceite de todos. |
| P34 | M0 | A conta do cadastro público é criada no primeiro login (perfil padrão) e fica bloqueada até o aceite. |
| P35 | M0 | Senhas antigas são removidas pelo comando `pnpm auth:migrate-google` (idempotente). |
| P36 | M0 | Prazo padrão de exclusão definitiva: 30 dias por tipo (1 a 3650). |
| P37 | M0 | Convite por e-mail marcado por padrão quando há SMTP; "Reenviar convite" para convites pendentes. |
| P38 | M0 | Até o M1, quem entra sem `admin.access` vê "Sem acesso" depois do aceite. (Superada no M1: o prestador vai para `/negocios`.) |
| P39 | M1 | O espaço do negócio (`/negocios/[id]`) é um aviso "Em desenvolvimento" até o M2; a transcrição na tela entra com ele. (Superada no M2: o espaço e a transcrição estão implementados.) |
| P40 | M1 | Prestador sem `admin.access` usa Negócios e o Agente Opex (só `opex.use`); ferramentas administrativas seguem exigindo o painel. |
| P41 | M1 | Onboarding obrigatório também no servidor: 403 `ONBOARDING_REQUIRED`. |
| P42 | M1 | IA indisponível: e-mail (SMTP, no máximo 1/h) a quem tem `integrations.ai.edit` + aviso na aba do Entrevistador. |
| P43 | M1 | Fora do onboarding obrigatório, `/negocios/novo` abre dentro do shell com sidebar. |
| P44 | M1 | Na simulação de usuário, as ações de negócio agem sobre o alvo como dono (auditoria com o ator real); na de perfil, o dono é o admin real; o onboarding segue as permissões simuladas. |
| P45 | M1 | Sem negócio ativo e com arquivados: entrevista obrigatória, com a opção de restaurar um arquivado. |
| P46 | M1 | Metas da entrevista: o usuário decide recorrência/período específico e a janela da meta por hora (estrutura do M2). |
| P47 | M2 | As páginas do espaço (Dashboard, Ficha, Atividades, Metas, Documentos, Sucessos, Entrevista) ficam como itens da barra lateral, abaixo do seletor de negócio. |
| P48 | M2 | Modo claro: com o espaço aberto, o `<html>` troca `.dark` por `.light`; ao sair, volta ao escuro. |
| P49 | M2 | O tema muda só os destaques (primária, foreground, anel e destaque da sidebar); o fundo da sidebar continua neutro (diferente do crm). |
| P50 | M2 | O mês/ano corrente das metas segue o fuso do navegador; sem ele (ou inválido), `America/Sao_Paulo`. |
| P51 | M2 | Contato comercial sem e-mail usa o e-mail atual da conta do dono (não é copiado). |
| P52 | M2 | O Agente Opex troca a logo a partir de uma imagem do chat (`set_business_logo`) e a remove por `update_business`. |
| P53 | M2 | Negócio arquivado: o espaço abre somente leitura, com aviso e "Restaurar". |
| P54 | M2 | Criar/editar atividades, metas, documentos e sucessos em diálogo sobre a lista. |
| P55 | M2 | A página da transcrição da entrevista saiu do espaço do negócio (e da barra lateral); a transcrição segue pela API e pelo Agente Opex. |
| P56 | M2 | A primeira cor dos gráficos (`--chart-1`) segue a cor primária do negócio; as demais ficam fixas. |
| P57 | M2 | O dashboard tem o seletor de período do Opex: Mês atual (padrão), 3, 6 ou 12 meses, guardado no navegador. |
| P58 | M2 | Todos os gráficos sugeridos entram; os de faturamento aparecem vazios até existirem trabalhos pagos (M4). |
| P59 | M2 | Uma meta ativa por negócio; criar uma meta nova tira a atual de vigor (índice único no banco). |
| P60 | M2 | Metas substituídas ficam no histórico somente para leitura (sem editar, arquivar, restaurar ou excluir) e não expiram; o prazo de exclusão vale só para as arquivadas. |
| P61 | M2 | Editar a meta atual cria uma nova versão; a versão anterior fica no histórico. |
| P62 | M2 | Arquivar a meta atual reativa a substituída mais recente; sem anterior, o negócio fica sem meta. Restaurar uma arquivada faz dela a atual. |
| P63 | M2 | Página de Metas: a meta atual + linha do tempo à direita (sem filtros/lista); no dashboard, a meta atual numa linha inteira e sem o gráfico "Progresso das metas ativas". |
| P64 | M1 | A entrevista coleta uma meta só; entrevistas antigas com várias: a última fica ativa e as demais no histórico. |
| P65 | M4 | Editar itens/horas/valor/prazo no trabalho altera o pedido aceito com uma versão "Alterado no trabalho" não publicada; o link do cliente segue mostrando a versão aceita. |
| P66 | M4 | Cards com posição manual salva e o seletor de ordenação do Opex: Manual, Prazo, Mais novos, Mais antigos. |
| P67 | M4 | Coluna customizada tem nome, cor, ícone e descrição (sem limite WIP). |
| P68 | M4 | Em Pago dá para "Editar pagamento" (auditado; o anterior fica no histórico). |
| P69 | M4 | Excluir um trabalho arquivado mantém o pedido Aceito como registro; horas, notas, anexos e movimentações saem e o sucesso ligado perde o vínculo. |
| P70 | M4 | Um Sucesso por trabalho, pelo diálogo do M2 pré-preenchido; depois o botão vira "Ver sucesso". |
