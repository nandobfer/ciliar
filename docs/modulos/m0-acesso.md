# M0 — Acesso público (Google, cadastro, convite, perfil padrão)

> **Atualização CIL-6 (27/10/2026):** o login por **e-mail e senha** voltou, junto do Google. Os métodos
> disponíveis são escolhidos por protocolo (HTTP/HTTPS) em Integrações › Autenticação (padrão: só Google).
> Senha: definida pelo admin (cadastro/edição), pelo próprio usuário ("Alterar/Criar senha"), pelo
> `pnpm user:create` (opcional) ou no cadastro público com senha. Regras em `aicontext/modules/access.md`.

Pré-requisito do M1: hoje o Ciliar só tem login e-mail/senha (Argon2id) e contas criadas pelo
admin/CLI. O produto passa a aceitar prestadores vindos de fora.

## Regras

### Autenticação

- **Somente Google** para todos (prestadores e administradores), via **Auth.js** (provider Google).
- O login **e-mail/senha deixa de existir** na interface. Senhas existentes deixam de ser usadas.
- **Migração dos usuários atuais** (inclusive administradores): passam a entrar com o Google usando
  o mesmo e-mail, com vínculo automático. Os e-mails atuais devem ser contas Google.
- **Vínculo automático**: se já existir usuário com o mesmo e-mail (criado por admin/CLI) e o Google
  informar o e-mail como **verificado**, a conta Google é vinculada a esse usuário (mantém perfis,
  histórico e auditoria). E-mail não verificado é recusado.
- Usuário **inativo** continua bloqueado, mesmo com Google válido.
- Regras de sessão atuais continuam: revalidação de conta ativa e `sessionVersion` em toda API.

### Cadastro público

- Qualquer pessoa com conta Google pode se cadastrar ("Entrar com Google" cria a conta se não existir).
- **Aceite de termos de uso e política de privacidade (LGPD)** obrigatório no primeiro acesso;
  registrar data/hora e versão dos termos aceitos. Sem aceite, não segue para o onboarding.
- **Texto dos termos e da política**: mantido pelo admin, gravado no **MongoDB** e versionado (cada
  publicação gera uma versão; o aceite referencia a versão). Editável na configuração da plataforma
  e pelo Agente Opex.
- **Nova versão publicada exige novo aceite** de todos os usuários: no próximo acesso (ou na próxima
  requisição), o usuário fica bloqueado na tela de aceite até aceitar a versão vigente (apenas
  aceitar ou sair). O servidor confere a versão aceita, não só a interface.
- O novo usuário recebe o **perfil padrão** (ver abaixo) e cai no onboarding (M1).

### Convite (pré-cadastro)

- O admin pré-cadastra um **e-mail** e escolhe os perfis de acesso (tela `/usuarios`).
- Quando a pessoa entra com Google usando esse e-mail, a conta já existe com os perfis definidos.
- E-mail de convite via SMTP é opcional (se SMTP configurado).
- O cadastro de usuário pelo admin **não pede mais senha**.

### Perfil padrão

- O admin escolhe **qual perfil de acesso existente** é atribuído no cadastro público
  (configuração global; perfil precisa estar ativo). Sem perfil padrão configurado, o cadastro
  público fica indisponível (falha fechado, com aviso).
- Usuários pré-cadastrados recebem os perfis escolhidos no convite, não o padrão.

### Configuração da plataforma

Fica em **Integrações** (novo item no catálogo de `/integracoes`, ex.: "Plataforma"), com as
permissões por integração já existentes (`integrations.{id}.view/edit`). Reúne:

- perfil padrão do cadastro público;
- termos de uso e política de privacidade (texto e versões);
- dias até a exclusão definitiva de itens arquivados, **um prazo por tipo** (negócios, atividades,
  metas, documentos, sucessos, clientes, trabalhos, itens avulsos do portfólio);
- limites de documentos/anexos (tamanho máximo e tipos permitidos, M2).

### Bootstrap (CLI)

- `pnpm user:create` passa a **pré-autorizar um e-mail Google** (nome, e-mail, perfis) — sem senha.
  Continua sendo a única forma de criar o primeiro Administrador.

## Permissões propostas

| Permissão | Uso |
|---|---|
| `users.create` | Pré-cadastrar (convidar) e-mails |
| `integrations.{plataforma}.view/edit` | Ver/alterar a configuração da plataforma (perfil padrão, termos, prazo de exclusão) |

## Agente Opex

Ferramentas de usuários passam a refletir o convite (sem senha inicial).

| Ferramenta | Risco |
|---|---|
| `get_legal_terms` (versão atual e histórico) | read |
| `update_legal_terms` (publica nova versão; bloqueia todos até o novo aceite) | destructive (com `summarize`) |
| `get_platform_settings` | read |
| `update_platform_settings` (perfil padrão = autoridade; prazo de exclusão) | destructive |
| `resend_user_invite` (reenvia o convite por e-mail) | write |

## Fora do escopo

Outros provedores (Microsoft, Apple), e-mail/senha, MFA, recuperação de senha.
