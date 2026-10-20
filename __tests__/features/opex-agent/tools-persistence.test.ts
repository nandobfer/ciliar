import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'

vi.mock('@/lib/db', async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))

import { accessModels } from '@/features/access/server/models'
import { resolveAccess } from '@/features/access/server/access'
import { requestAccess, type AccessContext } from '@/features/access/server/context'
import { hashPassword } from '@/features/auth/server/password'
import { ApiToken } from '@/lib/db/models/ApiToken'
import { findOpexTool } from '@/features/opex-agent/server/tools/registry'

/**
 * Ferramentas do agente contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real):
 * cada uma chama o comando do Ciliar com o contexto de acesso do usuário real.
 */

let replica: MongoMemoryReplSet
let admin: AccessContext
let adminRoleId: string
const models = accessModels()

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
  await Promise.all([...Object.values(models).map((model) => model.init()), ApiToken.init()])
}, 120_000)
beforeEach(async () => {
  await Promise.all([...Object.values(models).map((model) => model.deleteMany({})), ApiToken.deleteMany({})])
  const role = await models.roles.create({ slug: 'admin', nome: 'Administrador', permissoes: ['*'], ativo: true })
  adminRoleId = role.id as string
  const user = await models.users.create({ name: 'Admin', email: 'admin@example.test', passwordHash: await hashPassword('Senha temporária 123!'), active: true, roles: [role.id], mustChangePassword: false })
  admin = await resolveAccess(user.id as string, 'none', null, 0)
})
afterAll(async () => {
  await mongoose.disconnect()
  await replica?.stop()
})

describe('ferramentas de usuários e perfis (serviços reais)', () => {
  it('create_user cadastra com troca no primeiro acesso, auditoria do ator real e sem senha nas saídas', async () => {
    const role = await run('create_role', { name: 'Suporte', permissions: ['admin.access', 'users.view'] }, admin)
    const created = await run('create_user', { name: 'Ana', email: 'ANA@example.test', password: 'Senha-inicial-123', roleIds: [role.id] }, admin)
    expect(created).toMatchObject({ ok: true, email: 'ana@example.test', mustChangePassword: true })
    expect(JSON.stringify(created)).not.toContain('Senha-inicial-123')
    const stored = await models.users.findById(created.id).orFail()
    expect(stored.mustChangePassword).toBe(true)
    const audit = await models.audits.findOne({ action: 'user.create' }).lean()
    expect(audit?.actorId).toBe(admin.userId)
    expect(JSON.stringify(audit)).not.toContain('Senha-inicial-123')

    const listed = await run('list_users', { search: 'ana' }, admin)
    expect(JSON.stringify(listed)).not.toMatch(/passwordHash|argon2/)
    expect(listed).toMatchObject({ total: 1, users: [expect.objectContaining({ email: 'ana@example.test', roles: [{ id: role.id, name: 'Suporte' }] })] })
  })

  it('update_user altera só os campos informados; get_user mostra as permissões efetivas', async () => {
    const role = await run('create_role', { name: 'Leitor', permissions: ['admin.access', 'roles.view'] }, admin)
    const created = await run('create_user', { name: 'Bia', email: 'bia@example.test', password: 'Senha-inicial-123', roleIds: [role.id] }, admin)
    await run('update_user', { user: 'bia@example.test', active: false }, admin)
    const user = await run('get_user', { user: created.id }, admin)
    expect(user).toMatchObject({ name: 'Bia', active: false, effectivePermissions: ['admin.access', 'roles.view'] })
  })

  it('o próprio comando recusa quem não tem a permissão, mesmo chamando a ferramenta diretamente', async () => {
    const role = await run('create_role', { name: 'Só leitura', permissions: ['admin.access', 'users.view', 'opex.use'] }, admin)
    const created = await run('create_user', { name: 'Caio', email: 'caio@example.test', password: 'Senha-inicial-123', roleIds: [role.id] }, admin)
    await models.users.updateOne({ _id: created.id }, { $set: { mustChangePassword: false } })
    const viewer = await resolveAccess(String(created.id), 'none', null, 0)
    await expect(run('create_user', { name: 'Dani', email: 'dani@example.test', password: 'Senha-inicial-123', roleIds: [role.id] }, viewer)).rejects.toMatchObject({ status: 403 })
    await expect(run('delete_user', { user: 'admin@example.test' }, viewer)).rejects.toMatchObject({ status: 403 })
  })

  it('não exclui a própria conta nem concede permissões que o ator não possui', async () => {
    await expect(run('delete_user', { user: 'admin@example.test' }, admin)).rejects.toMatchObject({ status: 403 })
    const limitedRole = await run('create_role', { name: 'Gestor', permissions: ['admin.access', 'roles.view', 'roles.edit'] }, admin)
    const created = await run('create_user', { name: 'Eva', email: 'eva@example.test', password: 'Senha-inicial-123', roleIds: [limitedRole.id] }, admin)
    await models.users.updateOne({ _id: created.id }, { $set: { mustChangePassword: false } })
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
