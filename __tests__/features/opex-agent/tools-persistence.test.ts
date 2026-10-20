import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'

vi.mock('@/lib/db', async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
const mail = vi.hoisted(() => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/email/mailer', () => mail)

import { accessModels } from '@/features/access/server/models'
import { resolveAccess } from '@/features/access/server/access'
import { requestAccess, type AccessContext } from '@/features/access/server/context'
import { ApiToken } from '@/lib/db/models/ApiToken'
import { platformModels } from '@/features/platform/server/models'
import { findOpexTool } from '@/features/opex-agent/server/tools/registry'

/**
 * Ferramentas do agente contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real):
 * cada uma chama o comando do Ciliar com o contexto de acesso do usuário real.
 */

let replica: MongoMemoryReplSet
let admin: AccessContext
let adminRoleId: string
const models = accessModels()
const platform = platformModels()

async function run(name: string, raw: unknown, access: AccessContext) {
  const tool = findOpexTool(name)!
  const input = tool.input.parse(raw)
  tool.authorize?.(input, access)
  const scope = { userId: access.userId, viewAsHeader: access.viewAsHeader, sessionVersion: access.sessionVersion }
  return requestAccess.run(access, () => tool.execute(input, { sessionId: 's'.repeat(24), actorId: access.userId, scope, access })) as Promise<Record<string, unknown>>
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.18' }, replSet: { count: 1 }, instanceOpts: [{ ip: '127.0.0.1' }] })
  await mongoose.connect(replica.getUri('ciliar_opex_tools_test'))
  await Promise.all([...Object.values(models), ...Object.values(platform)].map((model) => model.init()).concat(ApiToken.init()))
}, 120_000)
beforeEach(async () => {
  vi.clearAllMocks()
  mail.isMockMode.mockResolvedValue(true)
  await Promise.all([...[...Object.values(models), ...Object.values(platform)].map((model) => model.deleteMany({})), ApiToken.deleteMany({})])
  const role = await models.roles.create({ slug: 'admin', nome: 'Administrador', permissoes: ['*'], ativo: true })
  adminRoleId = role.id as string
  const user = await models.users.create({ name: 'Admin', email: 'admin@example.test', active: true, roles: [role.id] })
  admin = await resolveAccess(user.id as string, 'none', null, 0)
})
afterAll(async () => {
  await mongoose.disconnect()
  await replica?.stop()
})

describe('ferramentas de usuários e perfis (serviços reais)', () => {
  it('create_user convida sem senha (convite pendente), com auditoria do ator real', async () => {
    const role = await run('create_role', { name: 'Suporte', permissions: ['admin.access', 'users.view'] }, admin)
    const created = await run('create_user', { name: 'Ana', email: 'ANA@example.test', roleIds: [role.id] }, admin)
    expect(created).toMatchObject({ ok: true, email: 'ana@example.test', invitePending: true, inviteEmail: 'nao-solicitado' })
    const stored = await models.users.findById(created.id).lean().orFail()
    expect(stored).not.toHaveProperty('passwordHash')
    const audit = await models.audits.findOne({ action: 'user.create' }).lean()
    expect(audit?.actorId).toBe(admin.userId)

    const listed = await run('list_users', { search: 'ana' }, admin)
    expect(JSON.stringify(listed)).not.toMatch(/passwordHash|googleSub/)
    expect(listed).toMatchObject({ total: 1, users: [expect.objectContaining({ email: 'ana@example.test', invitePending: true, roles: [{ id: role.id, name: 'Suporte' }] })] })
  })

  it('resend_user_invite exige SMTP e convite pendente', async () => {
    const role = await run('create_role', { name: 'Suporte', permissions: ['admin.access'] }, admin)
    await run('create_user', { name: 'Ana', email: 'ana@example.test', roleIds: [role.id] }, admin)
    await expect(run('resend_user_invite', { user: 'ana@example.test' }, admin)).rejects.toMatchObject({ code: 'SMTP_UNAVAILABLE' })
    mail.isMockMode.mockResolvedValue(false)
    expect(await run('resend_user_invite', { user: 'ana@example.test' }, admin)).toMatchObject({ ok: true, inviteEmail: 'enviado' })
    expect(mail.sendEmail).toHaveBeenCalledWith('ana@example.test', 'Convite para o Ciliar', expect.any(String))
    await models.users.updateOne({ email: 'ana@example.test' }, { $set: { googleSub: 'sub-ana' } })
    await expect(run('resend_user_invite', { user: 'ana@example.test' }, admin)).rejects.toMatchObject({ code: 'INVITE_NOT_PENDING' })
  })

  it('update_user altera só os campos informados; get_user mostra as permissões efetivas', async () => {
    const role = await run('create_role', { name: 'Leitor', permissions: ['admin.access', 'roles.view'] }, admin)
    const created = await run('create_user', { name: 'Bia', email: 'bia@example.test', roleIds: [role.id] }, admin)
    await run('update_user', { user: 'bia@example.test', active: false }, admin)
    const user = await run('get_user', { user: created.id }, admin)
    expect(user).toMatchObject({ name: 'Bia', active: false, effectivePermissions: ['admin.access', 'roles.view'] })
  })

  it('o próprio comando recusa quem não tem a permissão, mesmo chamando a ferramenta diretamente', async () => {
    const role = await run('create_role', { name: 'Só leitura', permissions: ['admin.access', 'users.view', 'opex.use'] }, admin)
    const created = await run('create_user', { name: 'Caio', email: 'caio@example.test', roleIds: [role.id] }, admin)
    const viewer = await resolveAccess(String(created.id), 'none', null, 0)
    await expect(run('create_user', { name: 'Dani', email: 'dani@example.test', roleIds: [role.id] }, viewer)).rejects.toMatchObject({ status: 403 })
    await expect(run('delete_user', { user: 'admin@example.test' }, viewer)).rejects.toMatchObject({ status: 403 })
  })

  it('não exclui a própria conta nem concede permissões que o ator não possui', async () => {
    await expect(run('delete_user', { user: 'admin@example.test' }, admin)).rejects.toMatchObject({ status: 403 })
    const limitedRole = await run('create_role', { name: 'Gestor', permissions: ['admin.access', 'roles.view', 'roles.edit'] }, admin)
    const created = await run('create_user', { name: 'Eva', email: 'eva@example.test', roleIds: [limitedRole.id] }, admin)
    const manager = await resolveAccess(String(created.id), 'none', null, 0)
    await expect(run('create_role', { name: 'Escalada', permissions: ['users.delete'] }, manager)).rejects.toMatchObject({ status: 403 })
  })

  it('update_role troca permissões; list_roles e get_role não expõem senhas', async () => {
    const role = await run('create_role', { name: 'Operação', permissions: ['admin.access'] }, admin)
    const updated = await run('update_role', { role: 'Operação', permissions: ['admin.access', 'integrations.smtp.view'] }, admin)
    expect(updated.permissions).toEqual(['admin.access', 'integrations.smtp.view'])
    const roles = await run('list_roles', {}, admin)
    expect((roles.roles as { id: string }[]).map((item) => item.id)).toEqual([adminRoleId, role.id])
    const detail = await run('get_role', { role: role.id }, admin)
    expect(detail).toMatchObject({ name: 'Operação', members: [] })
  })
})

describe('tokens da API interna', () => {
  it('create_api_token devolve o valor uma vez; o banco guarda só o hash e list/revoke funcionam', async () => {
    const created = await run('create_api_token', { name: 'Relatórios' }, admin)
    expect(String(created.token)).toMatch(/^mt_sys_/)
    const stored = await ApiToken.findOne().lean()
    expect(JSON.stringify(stored)).not.toContain(String(created.token))
    const listed = await run('list_api_tokens', {}, admin)
    expect(JSON.stringify(listed)).not.toContain(String(created.token))
    const item = created.item as { id: string }
    await run('revoke_api_token', { tokenId: item.id }, admin)
    expect((await run('list_api_tokens', {}, admin)).tokens).toEqual([])
  })
})

describe('ferramentas da plataforma (serviços reais)', () => {
  it('update_platform_settings altera só o informado e respeita as regras do perfil padrão', async () => {
    const role = await run('create_role', { name: 'Prestador', permissions: ['admin.access'] }, admin)
    await expect(run('update_platform_settings', { defaultRoleId: adminRoleId }, admin)).rejects.toMatchObject({ code: 'DEFAULT_ROLE_INVALID' })
    await run('update_platform_settings', { defaultRoleId: role.id, retentionDays: { clients: 60 } }, admin)
    const settings = await run('get_platform_settings', {}, admin)
    expect(settings).toMatchObject({ defaultRole: { id: role.id, name: 'Prestador' }, retentionDays: { clients: 60, jobs: 30 }, publicSignup: { available: false }, legalVersion: 0 })
    await expect(run('update_platform_settings', {}, admin)).rejects.toThrow(/Nada para alterar/)
  })

  it('update_legal_terms publica versões; get_legal_terms lê vigente e histórico; o publicador fica bloqueado até aceitar', async () => {
    await expect(run('update_legal_terms', { termsOfUse: '# Termos' }, admin)).rejects.toThrow(/informe os dois textos/)
    expect(await run('update_legal_terms', { termsOfUse: '# Termos', privacyPolicy: '# Privacidade', notes: 'Primeira' }, admin)).toMatchObject({ ok: true, version: 1, previousVersion: null })
    const blocked = await resolveAccess(admin.userId, 'none', null, 0)
    expect(blocked.legalAcceptanceRequired).toBe(true)
    await expect(run('update_legal_terms', { privacyPolicy: '# Privacidade v2' }, blocked)).rejects.toMatchObject({ code: 'TERMS_ACCEPTANCE_REQUIRED' })
    const read = await run('get_legal_terms', {}, blocked)
    expect(read).toMatchObject({ currentVersion: 1, document: { version: 1, termsOfUse: '# Termos', notes: 'Primeira' }, history: [{ version: 1 }] })
    const slim = await run('get_legal_terms', { includeText: false }, blocked)
    expect(slim.document).not.toHaveProperty('termsOfUse')
  })
})
