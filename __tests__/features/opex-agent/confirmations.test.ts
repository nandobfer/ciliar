import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { memoryModel, type Doc } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  queueFollowUp: vi.fn(async () => {}),
  execute: vi.fn(async (input: { id: string }) => ({ deleted: input.id })),
  recordAudit: vi.fn(async () => {}),
  authorize: vi.fn(),
}))

const store = vi.hoisted(() => ({ messages: null as unknown, actions: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  const withUpdate = () => {
    const model = memoryModel()
    return Object.assign(model, { findByIdAndUpdate: (id: string, update: Doc) => model.findOneAndUpdate({ _id: id }, update) })
  }
  store.messages = withUpdate()
  store.actions = withUpdate()
  return { OpexMessage: store.messages, OpexPendingAction: store.actions, OpexSession: memoryModel() }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR' } }))
vi.mock('@/features/opex-agent/server/sessions', () => ({
  opexDb: async () => {},
  publishSessionUpdated: async () => {},
  // A ação só é decidida por quem enxerga a sessão dona (escopo do dono nestes casos).
  loadSession: async () => ({ _id: 'a'.repeat(24), userId: 'u'.repeat(24) }),
}))
vi.mock('@/features/opex-agent/server/authorize', () => ({ authorizeOpexTool: mocks.authorize }))
vi.mock('@/features/opex-agent/server/runner', () => ({ queueFollowUp: mocks.queueFollowUp }))
vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
const tool = { name: 'delete_thing', group: 'users', label: 'Excluir', risk: 'destructive', description: 'd', input: z.object({ id: z.string() }), summarize: (input: { id: string }) => `Excluir ${input.id}`, execute: mocks.execute }
vi.mock('@/features/opex-agent/server/tools/registry', () => ({ findOpexTool: (name: string) => (name === tool.name ? tool : undefined) }))

import { decideAction, requestConfirmation } from '@/features/opex-agent/server/confirmations'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'
import { requestAccess } from '@/features/access/server/context'
import { accessFixture } from '../../helpers/access-context'

type Model = ReturnType<typeof memoryModel>
const actions = () => store.actions as Model
const messages = () => store.messages as Model
const SESSION = 'a'.repeat(24)
const MESSAGE = 'b'.repeat(24)
const SCOPE = { userId: 'u'.repeat(24), viewAsHeader: 'none', sessionVersion: 0 }
const ACCESS = accessFixture(['admin.access', 'opex.use', 'users.delete'])

beforeEach(() => {
  vi.clearAllMocks()
  actions().docs.splice(0)
  messages().docs.splice(0)
  mocks.authorize.mockResolvedValue(ACCESS)
})

async function pending(): Promise<string> {
  const confirmation = await requestConfirmation(SESSION, MESSAGE, tool as unknown as OpexTool, { id: 'x1' }, 'call-1')
  await messages().create({ _id: MESSAGE, parts: [{ type: 'tool', id: 'call-1', name: tool.name, state: 'done', output: null, confirmation }] })
  return confirmation.actionId
}

describe('confirmações do Agente Opex', () => {
  it('pedir confirmação grava a pendência com o resumo, sem executar', async () => {
    const actionId = await pending()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(actions().docs[0]).toMatchObject({ toolName: 'delete_thing', summary: 'Excluir x1', status: 'pending' })
    expect(actionId).toBeTruthy()
  })

  it('confirmar executa a ferramenta, atualiza o card e devolve o resultado ao agente', async () => {
    const actionId = await pending()
    const result = await decideAction(actionId, 'confirm', SCOPE)
    expect(result.status).toBe('confirmed')
    expect(mocks.authorize).toHaveBeenCalledWith(tool, { id: 'x1' }, SCOPE)
    expect(mocks.execute).toHaveBeenCalledWith({ id: 'x1' }, { sessionId: SESSION, actorId: SCOPE.userId, scope: SCOPE, access: ACCESS })
    expect((messages().docs[0]!.parts as Doc[])[0]).toMatchObject({ confirmation: { status: 'confirmed' }, output: expect.stringContaining('x1') })
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ kind: 'confirmation', display: 'Confirmado: Excluir x1', text: expect.stringContaining('CONFIRMOU'), scope: SCOPE }))
    expect(actions().docs[0]!.input).toBeNull()
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'EXECUTAR' }))
  })

  it('cancelar não executa e avisa o agente; decidir de novo é recusado', async () => {
    const actionId = await pending()
    await decideAction(actionId, 'cancel', SCOPE)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ display: 'Cancelado: Excluir x1', text: expect.stringContaining('CANCELOU') }))
    await expect(decideAction(actionId, 'confirm', SCOPE)).rejects.toMatchObject({ status: 409, code: 'OPEX_ACTION_DECIDED' })
  })

  it('execução confirmada que falha marca a ação como falha e conta ao agente', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('Storage fora do ar'))
    const actionId = await pending()
    const result = await decideAction(actionId, 'confirm', SCOPE)
    expect(result).toMatchObject({ status: 'failed', error: 'Storage fora do ar' })
    expect(mocks.queueFollowUp).toHaveBeenCalledWith(SESSION, expect.objectContaining({ text: expect.stringContaining('falhou: Storage fora do ar') }))
  })

  it('a execução confirmada roda no contexto de acesso revalidado (auditoria com o ator real)', async () => {
    let seen: unknown = null
    mocks.execute.mockImplementationOnce(async (input: { id: string }) => {
      seen = requestAccess.getStore()
      return { deleted: input.id }
    })
    const actionId = await pending()
    await decideAction(actionId, 'confirm', SCOPE)
    expect(seen).toBe(ACCESS)
  })

  it('permissão perdida depois do card: a ação falha sem executar', async () => {
    mocks.authorize.mockRejectedValueOnce(Object.assign(new Error('Seu acesso não permite usar delete_thing'), { status: 403 }))
    const actionId = await pending()
    const result = await decideAction(actionId, 'confirm', SCOPE)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('não permite') })
  })

  it('ferramenta com segredo não aguarda confirmação sem a chave de criptografia', async () => {
    const previous = process.env.INTEGRATIONS_ENCRYPTION_KEY
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    try {
      const secret = { ...tool, redact: (input: { id: string }) => input }
      await expect(requestConfirmation(SESSION, MESSAGE, secret as unknown as OpexTool, { id: 'x1' }, 'call-2')).rejects.toMatchObject({ code: 'OPEX_SECRET_BOX_REQUIRED' })
    } finally {
      if (previous !== undefined) process.env.INTEGRATIONS_ENCRYPTION_KEY = previous
    }
  })

  it('confirmação expirada é recusada', async () => {
    const actionId = await pending()
    actions().docs[0]!.expiresAt = new Date(Date.now() - 1000)
    await expect(decideAction(actionId, 'confirm', SCOPE)).rejects.toMatchObject({ status: 409, code: 'OPEX_ACTION_EXPIRED' })
  })
})
