# Plataforma (M0)

Regras de produto em `docs/modulos/m0-acesso.md`. Configuração global em **Integrações ›
Plataforma** (`/integracoes/plataforma`, id `platform` no catálogo, sem campos genéricos), com as
permissões `integrations.platform.view/edit` geradas pela árvore de integrações.

## Persistência (`src/features/platform`)

- `platform_settings` (singleton `_id: "global"`): `defaultRoleId`, `retentionDays` (um prazo por
  tipo: `businesses`, `activities`, `goals`, `documents`, `successes`, `clients`, `jobs`,
  `portfolioItems`; 1–3650, padrão 30), `documents` (`maxFileSizeMb` 1–200, padrão 25;
  `allowedTypes` ⊂ `pdf`/`images`/`office`/`text`, MIME em `DOCUMENT_TYPE_MIME`), `legalVersion`
  (0 = nada publicado) e `version` (otimista). Campos/tipos novos recebem o padrão ao ler
  (`server/state.ts`, `withPlatformDefaults`).
- `legal_versions`: `{ version (único, sequencial), termsOfUse, privacyPolicy (markdown), notes,
  publishedBy, publishedAt }`, imutáveis. Termos e política são publicados juntos numa versão só.
- `server/state.ts` não depende dos comandos de acesso (evita ciclo): `loadPlatformState`,
  `currentLegalVersion` (lido em toda `resolveAccess`), `ensurePlatformRecord` (upsert fora da
  transação) e `assertNotDefaultRole`.

## Regras

- Salvar (`updatePlatformSettings`) e publicar (`publishLegalVersion`) passam por
  `authorityTransaction` (replica set, fence, majority) com `integrations.platform.edit`.
  Conflito de versão → 409 `VERSION_CONFLICT`, sem sobrescrever; auditoria em `access_audit`
  (`platform.update`, `legal.publish` sem os textos, só tamanhos).
- **Perfil padrão** é autoridade: precisa existir, estar ativo, nunca ser o Administrador nem ter
  `*` (400 `DEFAULT_ROLE_INVALID`) e ser atribuível pelo ator pela hierarquia Perfix (403). Só é
  validado quando muda. Enquanto for o padrão, o perfil não pode ser inativado/excluído.
- **Cadastro público** (`signupAvailability`) só existe com perfil padrão válido **e** termos
  publicados; senão falha fechado (`no-default-role`, `default-role-invalid`, `no-legal-version`).
  O teste da integração (`testPlatform`, também no health-check) mostra a situação.
- **Nova versão** bloqueia todos os usuários (inclusive quem publicou) até aceitar; o aceite vale
  só para a versão vigente (ver `access.md`).

## Telas

`PlatformEditorForm` (abas com `IntegrationTabs`/`useIntegrationTab`, descarte confirmado):
**Cadastro** (perfil padrão em Select com chips, motivos de bloqueio e situação), **Termos e
privacidade** (`LegalTermsTab`: `MarkdownField` para os dois textos, resumo, publicar com
confirmação, histórico com visualização; somente leitura sem `edit`), **Retenção** e
**Documentos**. A versão da abertura é mantida para o PUT; refetch não promove rascunho.
O Select do perfil padrão ignora `onValueChange("")`: dentro de `<form>`, o `<select>` nativo oculto
do Radix emite "" quando o valor muda por `form.reset`, o que apagava o perfil salvo ("ID inválido").
`LegalAcceptance` é o bloqueio do usuário. Páginas públicas `/termos` e `/privacidade`
(`PublicLegalPage`) mostram a versão vigente — exigidas pela tela de consentimento OAuth do Google.

## APIs

| Rota | Permissão | Descrição |
|---|---|---|
| `GET/PUT /api/platform/settings` | `integrations.platform.view` / `.edit` | Configuração, disponibilidade do cadastro e perfis elegíveis |
| `GET /api/platform/legal[?version=N]` | `integrations.platform.view` | Vigente + histórico, ou o texto de uma versão |
| `POST /api/platform/legal` | `integrations.platform.edit` | Publica nova versão (201) |
| `GET /api/me/legal` · `POST /api/me/legal/accept` | sessão (sem `admin.access`) | Versão vigente e aceite do usuário real |

## Testes

`__tests__/features/platform/platform.test.ts` (persistência, regras do perfil padrão, versões,
concorrência), `legal-ui.test.tsx` (bloqueio) e o tester em `integrations/smtp-s3-testers.test.ts`.
