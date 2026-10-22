# M5 — Portfólio

**Página pública** e opcional de cada negócio, sem login, que mostra o trabalho feito.

## 1. Endereço e publicação

- URL pública `/p/[slug]`, com **slug editável e único** em toda a plataforma (minúsculas, números e
  hífen). Trocar o slug **quebra o endereço antigo** (sem redirecionamento); a tela avisa.
- Slug **sugerido a partir do nome do negócio**; palavras **reservadas** recusadas (`admin`, `api`,
  `login`, rotas existentes…).
- Ao **restaurar** um negócio arquivado, o portfólio volta com o **estado de publicação anterior**.
- Página pública usa o **logo como favicon e imagem Open Graph**, com nome e descrição do negócio.
- **Liga/desliga**: desligado (ou negócio arquivado) responde **404** público.
- **Pré-visualizar** como o visitante antes de publicar.
- **Indexação no Google** opcional: `noindex` por padrão; o prestador pode permitir.
- **Editor de blocos** (estilo montador, 22/10/2026): ver §2.1.

## 2. Conteúdo

| Seção | Origem | Regra |
|---|---|---|
| Dados do negócio | Ficha (M2) | Nome, logo, descrição, área, links, contato comercial. |
| Sucessos | M2 | Selecionados um a um. **Nome do cliente**: o prestador decide **por item** — mostrar o nome ou "Cliente confidencial" (padrão). Dos anexos, só as imagens são publicadas. |
| Documentos | M2 | Selecionados um a um entre os marcados **"Usar no portfólio"**. Imagens e PDF são **exibidos na página e podem ser baixados**; os demais tipos, só download. Download por URL assinada temporária do storage. |
| Serviços | Atividades ativas (M2) | Selecionados um a um. **Nome e descrição, sem valores**. |
| Itens avulsos | Cadastro próprio | Projetos só para o portfólio (abaixo). |

Disponibilidade, valores, clientes, pedidos e trabalhos **nunca** aparecem.

### Item avulso

| Campo | Regra |
|---|---|
| Título | Obrigatório. |
| Descrição | Opcional. |
| Imagens | Galeria (Storage S3, limites dos documentos). |
| Link externo | URL opcional. |
| Data | Opcional. |
| Categoria/tags | Texto livre com sugestão das já usadas no negócio. |

Item escolhido que deixa de estar disponível (arquivado, desmarcado ou inativo) some da página e volta
quando fica disponível de novo; excluído sai dos blocos.

Arquivamento igual aos itens do M2, com prazo próprio de exclusão definitiva.

### 2.1 Editor de blocos

- A página é uma **coluna de blocos** montada por arrastar e soltar: barra esquerda com **Blocos**
  (estrutura e seções), **Conteúdo** (sucessos, serviços, documentos, itens avulsos e a **mídia**) e
  **Página** (publicação, endereço, indexação, contato e tema); centro com a página real no tema do
  negócio; direita com as **propriedades** do bloco selecionado.
- Blocos: Título, Texto (negrito, itálico, links e listas), Imagem (texto alternativo obrigatório para
  publicar), Galeria, Botão (WhatsApp, e-mail, telefone ou link), Depoimento, Separador, **Colunas** (2
  ou 3, só blocos simples dentro, até 6 por coluna), **Seção** (escolhidos um a um ou todos os
  disponíveis; ordem, limite e layout grade/lista/carrossel) e **Item em destaque**. Estilo por presets
  (fundo, espaçamento, alinhamento). Até 80 blocos.
- **Cabeçalho e contato fixos** (vêm da Ficha).
- Rascunho salvo sozinho, com **Desfazer/Refazer**; **"Publicar alterações"** troca a página pública
  (o publicado congela a montagem; o conteúdo dos itens é lido ao vivo). Descartar rascunho e
  **histórico** das 20 últimas publicações com "Restaurar como rascunho".
- **Modelos prontos** (Clássico, Vitrine, Minimalista, em branco) na primeira abertura.
- Funciona no celular (barras em gavetas) e pelo teclado; pré-visualização Desktop/Celular.

## 3. Contato

O visitante **só vê o contato** (e-mail, telefone/WhatsApp, links). Não há formulário nem criação de
pedido pelo portfólio.

## 4. Aparência

Usa o **tema do negócio** (cor primária + claro/escuro), definido no M2 (§ Tema do negócio).

## 5. Segurança

- Rota pública sem sessão, com limitação de taxa; expõe somente os campos listados acima, montados no
  servidor a partir de uma lista explícita (nunca o documento do negócio inteiro).
- Arquivos só por URL assinada de curta duração, e apenas de itens publicados.

## 6. Permissões

Desde 22/10/2026 as permissões dos Negócios são por módulo, sobre a base `businesses.use` (catálogo completo em `aicontext/modules/access.md`, "Permissões dos Negócios por módulo").
`portfolio.view` (ver e pré-visualizar), `portfolio.edit` (rascunho dos blocos, modelos, histórico, mídia e
itens avulsos) e `portfolio.publish` (publicar alterações, ligar/desligar a página, endereço e indexação).
`businesses.view_all` (somente leitura).

## 7. Agente Opex (ferramentas)

| Ferramentas | Risco |
|---|---|
| `get_portfolio_page` (configuração, blocos do rascunho, conteúdo disponível, mídia, histórico), `list_portfolio_media` | read |
| `add_portfolio_block`, `update_portfolio_block`, `move_portfolio_block`, `add_portfolio_media` (imagens do chat), `update_portfolio_settings` | write |
| `remove_portfolio_block`, `apply_portfolio_template`, `discard_portfolio_draft`, `restore_portfolio_publication`, `delete_portfolio_media` | destructive (substitui/apaga) |
| `publish_portfolio_changes`, `publish_portfolio` / `unpublish_portfolio` | destructive (expõe/retira conteúdo público) |
| `update_portfolio_slug` | destructive (quebra o endereço antigo) |
| `list_portfolio_items`, `create_portfolio_item`, `update_portfolio_item` (imagens do chat) | read / write / write |
| `archive_portfolio_item`, `restore_portfolio_item`, `delete_portfolio_item` | destructive / write / destructive |

## 8. Auditoria

Publicação de alterações (resumo dos blocos antes/depois), liga/desliga, troca de slug, indexação,
descarte do rascunho, modelo aplicado, restauração de publicação, mídia e itens avulsos. O salvamento
automático do rascunho não é auditado a cada tecla.
