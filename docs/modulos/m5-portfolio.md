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
- **Ordem das seções e dos itens** por arrastar (dnd-kit, também por teclado).

## 2. Conteúdo

| Seção | Origem | Regra |
|---|---|---|
| Dados do negócio | Ficha (M2) | Nome, logo, descrição, área, links, contato comercial. |
| Sucessos | M2 | Selecionados um a um. **Nome do cliente**: o prestador decide **por item** — mostrar o nome ou "Cliente confidencial". |
| Documentos | M2 | Somente os marcados **"Usar no portfólio"**. Imagens e PDF são **exibidos na página e podem ser baixados**; os demais tipos, só download. Download por URL assinada temporária. |
| Serviços | Atividades ativas (M2) | **Nome e descrição, sem valores**. |
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

Arquivamento igual aos itens do M2, com prazo próprio de exclusão definitiva.

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

`businesses.use` (próprio negócio) e `businesses.view_all` (somente leitura).

## 7. Agente Opex (ferramentas)

| Ferramentas | Risco |
|---|---|
| `get_portfolio` (configuração, seções, URL) | read |
| `update_portfolio` (seções, ordem, sucessos/documentos selecionados, cliente confidencial, indexação) | write |
| `publish_portfolio` / `unpublish_portfolio` | destructive (expõe/retira conteúdo público) |
| `update_portfolio_slug` | destructive (quebra o endereço antigo) |
| `list_portfolio_items`, `create_portfolio_item`, `update_portfolio_item` (imagens do chat) | read / write / write |
| `archive_portfolio_item`, `restore_portfolio_item`, `delete_portfolio_item` | destructive / write / destructive |

## 8. Auditoria

Publicação/despublicação, troca de slug, alterações de seções e itens.
