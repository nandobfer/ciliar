# M1 — Agente Entrevistador + criação do Negócio

Primeiro módulo de produto. Um agente de IA entrevista o usuário com um **roteiro guiado** e, ao
final, **cria o Negócio diretamente** com as respostas.

## 1. Quando a entrevista acontece

- **A cada novo negócio**: criar um negócio sempre abre a entrevista (não há formulário de criação).
- **Primeiro acesso**: usuário sem nenhum negócio **que tenha o escopo "Negócios"** (ramo de
  permissões `businesses.*`) em algum de seus perfis de acesso é levado à entrevista e **não acessa o
  restante da plataforma até concluí-la** (apenas sair/logout). Quem não tem esse escopo (ex.:
  administradores sem o ramo) nunca é forçado à entrevista.
- **Retomada**: o progresso é salvo a cada resposta. Se a aba for fechada, ao voltar o usuário
  continua de onde parou (mesma entrevista, mesmas respostas).
- Não é possível pular a entrevista nem trocar por formulário.
- Uma entrevista em andamento por usuário por vez.
- A entrevista em andamento **não expira**.
- **Descartar** a entrevista em andamento (apaga respostas e transcrição, com confirmação) só é
  permitido a quem **já tem outro negócio ativo**. Sem negócio ativo, a entrevista continua
  obrigatória.

## 2. Limite de negócios

- Limite configurado **por perfil de acesso** (campo no perfil). Perfil sem limite = **ilimitado**.
- Usuário com vários perfis: vale o **maior** limite (perfil ilimitado vence).
- Contam no limite **somente os negócios ativos**; arquivados não contam. Restaurar um arquivado
  exige vaga no limite.
- No limite, "Novo negócio" fica indisponível com aviso; o servidor também recusa.

## 3. Roteiro

O roteiro é **totalmente configurável** pelo admin em `/integracoes/ia` (aba **Agente Entrevistador**).

- Lista **ordenada** de perguntas; cada pergunta aponta para **um campo nativo** do Negócio
  (não existem campos personalizados).
- Por pergunta o admin define: campo, texto/orientação da pergunta, **obrigatória** (sim/não),
  **ativa** (sim/não) e ordem. Cada campo aparece no máximo uma vez.
- Nenhum campo é obrigatório por imposição do sistema: o admin decide tudo.
- **Versionado**: cada gravação gera uma nova versão. A entrevista usa sempre a versão com que
  **começou**, mesmo que o roteiro mude no meio.

### Roteiro padrão

| Ordem | Campo | Obrigatória |
|---|---|---|
| 1 | Nome do negócio | Sim |
| 2 | Tipo (PF / PJ) | Sim |
| 3 | Área/segmento (texto livre) | Sim |
| 4 | Logo/foto (upload) | Não |
| 5 | Site e redes sociais (links) | Não |
| 6 | Disponibilidade | Não |
| 7 | Metas iniciais | Não |

## 4. Campos nativos do Negócio usados no roteiro

| Campo | Tipo / regra |
|---|---|
| Nome do negócio | Texto. Se vazio (pergunta desligada/pulada), nome automático **"Negócio N"**, editável depois. |
| Tipo | `PF` ou `PJ`. |
| Subtipo | Texto livre **definido/interpretado pelo agente** a partir das respostas (ex.: MEI, ME, EPP, autônomo). Opcional; editável depois. |
| Área/segmento | Texto livre. |
| Logo/foto | Imagem enviada no chat (Storage S3). |
| Site e redes | Lista de links (URL válida). |
| Disponibilidade | Opcional em tudo: dias da semana e, por dia, janela de horário (início–fim). |
| Metas iniciais | Lista de metas (estrutura abaixo). |
| Moeda | **BRL por padrão**, não perguntada no roteiro padrão; editável no espaço do negócio. O admin pode incluir a pergunta "Moeda" no roteiro. |

**Meta** (mesma estrutura do módulo Metas, M2): somente **faturamento bruto**, com valor alvo e
período **hora**, **mês** ou **ano**. Meta por hora = **valor médio faturado por hora**
(faturamento ÷ horas trabalhadas). Valor na moeda do negócio.

## 5. Comportamento do agente

- Fala em pt-BR, **uma pergunta por vez**, na ordem do roteiro.
- Na abertura informa que **os dados poderão ser alterados depois** no espaço do negócio.
- Valida a resposta conforme o tipo do campo e pede de novo se inválida.
- **Obrigatória**: não avança sem resposta válida.
- **Opcional**: aceita "pular" e **avisa** que pode preencher depois no espaço do negócio.
- O usuário pode corrigir uma resposta anterior pedindo na conversa.
- Fora do assunto: o agente reconduz educadamente ao roteiro.
- **Não gera conteúdo** (bio, sugestões de atividades/metas): grava somente o que o usuário disse.
  Única exceção: o **subtipo** (MEI, ME, EPP…), que o agente interpreta pelo que o usuário contou,
  sem pergunta própria.
- Entrada **somente texto** (+ upload de imagem quando o campo for logo/foto). Sem áudio.
- Ao responder a última pergunta, o **Negócio é criado diretamente** (sem tela de revisão) e o
  usuário é levado ao espaço do negócio.

## 6. Interface

- **Página dedicada em tela cheia** (ex.: `/negocios/novo`), sem sidebar no onboarding obrigatório.
- Chat central + painel de progresso com as perguntas do roteiro (pendente, respondida, pulada) e
  o valor coletado.
- Reaproveitar componentes de chat do Agente Opex/`~/code/opex` (mensagens, streaming, anexos).
- **IA indisponível** (provedor não configurado/fora): tela de bloqueio "tente mais tarde"; o admin
  é alertado. Sem formulário de contingência.

## 7. Configuração (`/integracoes/ia`, aba "Agente Entrevistador")

- Provedor, modelo e variante (mesmos provedores do Agente Opex), instruções com "Restaurar padrão".
- Editor do roteiro (ordem por arrastar, campo, texto, obrigatória, ativa) com histórico de versões.
- Ver exige `integrations.ai.view`; salvar, `integrations.ai.edit`.

## 8. Negócios: seleção, arquivamento e exclusão

- **Seletor de negócio** no topo da sidebar (com "Novo negócio") **e** página `/negocios` de
  gerenciamento (cards). O negócio ativo fica na URL.
- **Arquivar** em vez de excluir: arquivado some do seletor e pode ser restaurado.
- **Exclusão definitiva automática** depois de X dias arquivado (X configurado pelo admin em
  Integrações › Plataforma), pela
  rotina de crons interna; apaga anexos no S3.
- O dono **pode excluir definitivamente** um negócio arquivado antes do prazo automático, com
  confirmação explícita (apaga dados e anexos; irreversível).

## 9. Histórico da entrevista

- A transcrição fica **salva** e visível ao dono no espaço do negócio, e a quem tiver a permissão
  de suporte (`businesses.view_all`).

## 10. Permissões propostas

| Permissão | Uso |
|---|---|
| `businesses.use` | Criar (via entrevista), ver e editar os **próprios** negócios |
| `businesses.view_all` | Suporte: ver negócios/entrevistas de outros usuários (auditado) |
| `integrations.ai.view/edit` | Configuração do Entrevistador e roteiro |
| `roles.edit` | Limite de negócios no perfil de acesso |

## 11. Agente Opex (ferramentas)

| Ferramenta | Risco |
|---|---|
| `list_businesses`, `get_business`, `get_business_interview` | read |
| `update_business` | write |
| `archive_business`, `restore_business` | destructive / write |
| `delete_business` (somente arquivado) | destructive |

- **Não** há `create_business`: negócio só nasce pela entrevista (o agente orienta a usar
  `/negocios/novo`).
- Não há ferramenta para alterar a configuração/roteiro do Entrevistador (regra do `AGENTS.md`).

## 12. Auditoria

Criação, edição, arquivamento, restauração e exclusão automática de negócio; início e conclusão de
entrevista; alterações do roteiro (com versão) e acessos de suporte a negócios de terceiros.
