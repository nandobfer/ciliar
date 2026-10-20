# Docker e deploy

Infraestrutura copiada de `~/code/opex`: `Dockerfile`, `.dockerignore`, `docker-compose.yml`,
`docker-compose.deploy.yml` e `scripts/deploy-production.ts`, com os testes originais do script.
Dockerfile e dockerignore são idênticos aos da origem. Nomes de projeto/imagem, banco e variáveis
de deploy foram adaptados para Ciliar; nenhum serviço, volume, dado ou segredo do Opex é copiado.

## Imagem e Compose

- Node 22 Alpine, pnpm do `packageManager`, instalação com lockfile congelado.
- Estágios `deps`, `dev`, `builder`, `runner`; produção usa Next standalone com usuário `nextjs`.
- Args públicos `NEXT_PUBLIC_*` preservados; `.env*`, `.git`, caches, worktrees e dados locais não
  entram no contexto. Segredos de runtime vêm do `.env` via Compose, nunca de build args.
- Projeto `ciliar-${PORT}`, `PORT=3101` neste ambiente. Não compartilha containers com Opex.
- `app`: produção, restart always, limite de 2 CPUs/4 GiB.
- `app-dev`: perfil `dev`, limite de 3 CPUs/6 GiB, mesmo Compose Watch/hot reload da origem.
- Ambos usam as redes externas existentes `mongodb-network` e `soketi-network`. Não cria nem
  recria MongoDB/Soketi e não importa volumes. `build.network: host` preserva o ambiente rootless.

## Ambiente e comandos

`MONGODB_URI` é a conexão do desenvolvimento no host (`127.0.0.1`). Configure também
`DOCKER_MONGODB_URI` com hostname `mongodb`, banco `ciliar` e as credenciais próprias do Ciliar.
Compose injeta essa URI como `MONGODB_URI` dentro dos containers; não usa o localhost do host nem
faz fallback para Opex. No ambiente inicial essa variável já está preparada no `.env` não versionado.
Endereços de Pusher/S3 e outros serviços também devem ser acessíveis de dentro do container.
O banco deve ser replica set para administração de acessos. Não reconfigure o Mongo compartilhado.
Configure `AUTH_SECRET` novo e `APP_ORIGIN` com a origem pública canônica (HTTPS em produção).
Argon2id usa `@node-rs/argon2`, externalizado no Next para preservar o binário da plataforma Alpine.

```sh
# Validação sem imprimir as credenciais resolvidas.
docker compose config --quiet
# Desenvolvimento: selecione app-dev explicitamente, para não subir app na mesma porta.
docker compose --profile dev up --build --watch app-dev
# Produção (não execute junto com app-dev ou pnpm dev na mesma porta).
docker compose up -d --build app
```

As redes externas precisam existir; neste servidor já existem. Em outro ambiente, prepare as
redes e conecte os serviços correspondentes antes de subir o app. Copiar esta infraestrutura não
executa build, não inicia containers e não configura GitHub Actions ou publica deploys.

## Imagem pronta e script remoto

Override usa `CILIAR_IMAGE` (não `OPEX_IMAGE`), `pull_policy: never`:

```sh
CILIAR_IMAGE=ciliar:TAG docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --no-build --pull never app
```

A imagem deve estar carregada no daemon de destino. O script `scripts/deploy-production.ts`
preserva SSH/SCP com known_hosts, checksum SHA-256, verificação de arquitetura e redes, `docker
load`, recriação sem build/pull e healthcheck. Nunca o execute com destinos do Opex.

Entradas obrigatórias: `DEPLOY_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY` (caminho do arquivo),
`DEPLOY_KNOWN_HOSTS` (arquivo), `DEPLOY_REMOTE_DIR`, `DEPLOY_PROJECT_NAME`, `DEPLOY_IMAGE_TAG`,
`DEPLOY_IMAGE_ARCHIVE`, `DEPLOY_IMAGE_SHA256` e `DEPLOY_HEALTHCHECK_URL`.
Use diretório/projeto exclusivos e healthcheck `http://127.0.0.1:3101/integracoes`.
`DEPLOY_IMAGE_REPOSITORY` tem default `ciliar`; `DEPLOY_SERVICE`, `app`; `DEPLOY_PLATFORM`,
`linux/amd64`. Configuração é validada antes de comandos remotos; o script não é executado nesta cópia.

**Acesso:** a porta continua publicada em todas as interfaces. Use HTTPS/proxy/firewall e a origem
canônica. O app tem login e autorização, mas nunca crie contas ou exponha segredos por automação.
O CLI é executado no checkout ou na imagem de desenvolvimento, não no runner standalone:

```sh
pnpm user:create
# Alternativa Docker com terminal interativo e .env próprio:
docker compose --profile dev run --build --rm --no-deps app-dev pnpm user:create
```

O CLI mantém hostnames da rede dentro de container. No host, `SCRIPT_MONGODB_HOST` permite mapear
somente o hostname Docker configurado para `127.0.0.1` e `SCRIPT_MONGODB_PORT` define a porta publicada.

## Testes

```sh
pnpm test __tests__/deployment/docker-infrastructure.test.ts __tests__/deployment/deploy-production.test.ts
```

Testes Compose usam `.env` sintético em diretório temporário, apenas `config` (sem daemon/build/up),
e são pulados se Docker Compose não estiver instalado. Testes do script injetam executores falsos:
não fazem SSH, SCP nem deploy real.
