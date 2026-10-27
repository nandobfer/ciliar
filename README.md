# Ciliar

Base Next.js copiada de `~/code/opex`, com o mesmo tema escuro, componentes Shadcn/Radix,
Tailwind 4, sidebar responsiva, animações e bibliotecas (versões preservadas no lockfile).

## Desenvolvimento

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Preencha AUTH_SECRET, INTEGRATIONS_ENCRYPTION_KEY e CRON_SECRET com segredos novos, e
# AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET com o cliente OAuth do Google (login único).
# APP_ORIGIN deve ser a origem pública; MongoDB precisa ser replica set.
pnpm user:create
pnpm dev --port 3101
```

Abra <http://localhost:3101>. `/` redireciona para `/integracoes`.
MongoDB é necessário para persistir as configurações; o banco é **ciliar**, separado do Opex.
O ambiente local inicial já tem `.env` com chaves novas (não versionadas).

## Docker

Infraestrutura do Opex copiada, incluindo Dockerfile multi-stage, Compose de produção/dev com
Watch, override de imagem pronta e script de deploy. O `.env` local já tem `DOCKER_MONGODB_URI`
com credenciais próprias; ao preparar outro ambiente, configure essa URI com hostname `mongodb`.
As redes externas `mongodb-network` e `soketi-network` precisam existir (já existem neste servidor).

```sh
docker compose config --quiet
# Desenvolvimento com hot reload:
docker compose --profile dev up --build --watch app-dev
# Ou produção, sem outro servidor na porta 3101:
docker compose up -d --build app
```

Não execute os dois serviços simultaneamente na mesma porta. Nenhum container é iniciado
automaticamente por esta cópia. Use HTTPS e configure a origem canônica antes de expor o app.
Detalhes de imagens prontas e deploy: [Docker e deploy](aicontext/modules/deployment.md).

## Escopo da base

- Sidebar com **Integrações**, **Usuários** e **Perfis**, filtrada pelas permissões.
- Pusher, API interna (Swagger, explorador e tokens), Crons, Provedores de IA, SMTP, Storage S3 e
  Plataforma (cadastro público, termos e privacidade, prazos de exclusão e limites de documentos).
- IA: somente a aba **Provedores**, com OpenCode, Gemini e JEV e suas páginas originais.
- Crons: mesmo editor e motor, com a rotina de verificação de integrações e rotinas HTTP
  configuráveis. Rotinas de tarefas/GitHub/desenvolvimento do Opex não fazem parte desta base.
- Login do Opex com tsParticles; Auth.js somente com Google (cadastro público com perfil padrão,
  convite por e-mail pré-cadastrado e aceite versionado dos termos/LGPD). Desde a CIL-6 também e-mail e senha
  (Argon2id), com os métodos escolhidos por protocolo (HTTP/HTTPS) em Integrações › Autenticação.
- Perfix para perfis/hierarquia, usuários e **Visualizar como** por perfil/usuário, isolado por aba.
- APIs de configuração protegidas por sessão/permissão. Bearer de sistema e cron secret têm
  contratos independentes e não autorizam gerenciamento administrativo.

O primeiro administrador é pré-autorizado explicitamente por `pnpm user:create` em terminal
interativo (nome, e-mail, perfis e senha opcional) e entra com o Google usando esse e-mail ou com
a senha. Não há conta padrão nem criação automática.
Se a URI usa hostname Docker no host, ajuste `SCRIPT_MONGODB_HOST`/`SCRIPT_MONGODB_PORT`.
Veja [Autenticação e acessos](aicontext/modules/access.md) para regras e configuração.

Nenhum dado ou segredo do Opex é importado. Serviços externos começam sem configuração.
O símbolo original foi mantido para preservar o visual solicitado; o nome do app é Ciliar.

## Validação

```sh
pnpm exec tsc --noEmit
pnpm lint
pnpm test __tests__/app/ciliar-base.test.ts __tests__/app/pusher-auth.test.ts __tests__/features/access __tests__/features/auth __tests__/features/platform
```

Contexto de desenvolvimento: [aicontext/README.md](aicontext/README.md).
