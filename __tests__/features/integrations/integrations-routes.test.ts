import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { asAdministrator } from '../../helpers/access-context'

// Contratos dos handlers; a proteção real é exercitada em access/routes.test.ts.
vi.mock('@/features/access/server/protect-route', async () => {
  const { withRoute } = await import('@/lib/api/route')
  return {
    protectRoute: (handler: (...args: unknown[]) => Promise<Response>) => (...args: unknown[]) => asAdministrator(() => handler(...args)),
    withProtectedRoute: (handler: Parameters<typeof withRoute>[0]) => {
      const wrapped = withRoute(handler)
      return (...args: Parameters<typeof wrapped>) => asAdministrator(() => wrapped(...args))
    },
  }
})

const mocks = vi.hoisted(() => ({
  listIntegrations: vi.fn(),
  getIntegrationDetail: vi.fn(),
  updateIntegration: vi.fn(),
  listIntegrationLogs: vi.fn(),
  runIntegrationTest: vi.fn(),
  listApiTokens: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
  requireApiToken: vi.fn(),
}))

vi.mock('@/features/integrations/services/integration-service', async () => {
  const actual = await vi.importActual<typeof import('@/features/integrations/services/integration-service')>(
    '@/features/integrations/services/integration-service',
  )
  return {
    IntegrationUpdateError: actual.IntegrationUpdateError,
    listIntegrations: mocks.listIntegrations,
    getIntegrationDetail: mocks.getIntegrationDetail,
    updateIntegration: mocks.updateIntegration,
    listIntegrationLogs: mocks.listIntegrationLogs,
  }
})
vi.mock('@/features/integrations/services/integration-test-runner', () => ({ runIntegrationTest: mocks.runIntegrationTest }))
vi.mock('@/features/integrations/api-tokens/service', () => ({
  listApiTokens: mocks.listApiTokens,
  createApiToken: mocks.createApiToken,
  revokeApiToken: mocks.revokeApiToken,
  requireApiToken: mocks.requireApiToken,
}))
vi.mock('@/lib/logger', () => ({ logApiError: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET as listGET } from '@/app/api/integrations/route'
import { GET as detailGET, PATCH } from '@/app/api/integrations/[id]/route'
import { POST as testPOST } from '@/app/api/integrations/[id]/test/route'
import { GET as logsGET } from '@/app/api/integrations/[id]/logs/route'
import { GET as tokensGET, POST as tokensPOST } from '@/app/api/integrations/internal_api/tokens/route'
import { DELETE as tokenDELETE } from '@/app/api/integrations/internal_api/tokens/[tokenId]/route'
import { GET as whoamiGET } from '@/app/api/v1/whoami/route'
import { IntegrationUpdateError } from '@/features/integrations/services/integration-service'
import { DomainError } from '@/lib/api/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/integrations', () => {
  it('lista todas as integrações', async () => {
    mocks.listIntegrations.mockResolvedValue([{ id: 'pusher' }, { id: 'crons' }])
    const res = await listGET(new NextRequest('http://x/api/integrations'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.map((i: { id: string }) => i.id)).toEqual(['pusher', 'crons'])
    expect(mocks.listIntegrations).toHaveBeenCalledWith()
  })

  it('falha inesperada vira 500 em pt-BR', async () => {
    mocks.listIntegrations.mockRejectedValue(new Error('mongo down'))
    const res = await listGET(new NextRequest('http://x/api/integrations'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Erro ao listar integrações')
  })
})

describe('GET/PATCH /api/integrations/[id]', () => {
  it('404 para integração desconhecida', async () => {
    expect((await detailGET(new NextRequest('http://x'), params('meta'))).status).toBe(404)
    expect((await detailGET(new NextRequest('http://x'), params('google_drive'))).status).toBe(404)
    expect((await detailGET(new NextRequest('http://x'), params('archflow'))).status).toBe(404)
  })

  it('GET devolve o detalhe da integração', async () => {
    mocks.getIntegrationDetail.mockResolvedValue({ id: 'pusher' })
    const res = await detailGET(new NextRequest('http://x'), params('pusher'))
    expect(res.status).toBe(200)
    expect(mocks.getIntegrationDetail).toHaveBeenCalledWith('pusher')
  })

  it('PATCH valida o payload', async () => {
    const bad = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ publicValues: { internalBaseUrl: 'nao-e-url' } }) }),
      params('crons'),
    )
    expect(bad.status).toBe(400)
    expect(mocks.updateIntegration).not.toHaveBeenCalled()
  })

  it('PATCH salva com o ator autenticado e devolve o detalhe', async () => {
    mocks.updateIntegration.mockResolvedValue({ id: 'pusher' })
    const res = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ publicValues: { appId: '123' }, debugMode: true }) }),
      params('pusher'),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe('Integração salva')
    expect(mocks.updateIntegration).toHaveBeenCalledWith('pusher', { publicValues: { appId: '123' }, debugMode: true }, 'a'.repeat(24))
  })

  it('PATCH aceita a documentação Swagger e recusa URL que não é http(s)', async () => {
    mocks.updateIntegration.mockResolvedValue({ id: 'pusher' })
    const ok = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ swaggerUrl: 'https://api.exemplo.com/openapi.json' }) }),
      params('pusher'),
    )
    expect(ok.status).toBe(200)
    expect(mocks.updateIntegration).toHaveBeenCalledWith('pusher', { swaggerUrl: 'https://api.exemplo.com/openapi.json' }, 'a'.repeat(24))

    const bad = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ swaggerUrl: 'ftp://arquivo' }) }),
      params('pusher'),
    )
    expect(bad.status).toBe(400)
  })

  it('PATCH traduz o erro de chave de criptografia ausente em 409', async () => {
    mocks.updateIntegration.mockRejectedValue(new IntegrationUpdateError('Configure INTEGRATIONS_ENCRYPTION_KEY', 409))
    const res = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ secrets: { secret: { action: 'set', value: 'x' } } }) }),
      params('pusher'),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/INTEGRATIONS_ENCRYPTION_KEY/)
  })
})

describe('POST /api/integrations/[id]/test', () => {
  it('transmite os eventos em NDJSON e termina com o resultado', async () => {
    mocks.runIntegrationTest.mockImplementation(async (_id, options: { emit: (l: string, m: string) => void }) => {
      options.emit('step', 'Conectando')
      options.emit('success', 'Conectado')
      return { ok: true, latencyMs: 12, message: 'Pusher pronto' }
    })

    const res = await testPOST(new NextRequest('http://x', { method: 'POST' }), params('pusher'))
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.type)).toEqual(['log', 'log', 'result'])
    expect(lines[0]).toMatchObject({ level: 'step', message: 'Conectando' })
    expect(lines[2]).toMatchObject({ ok: true, message: 'Pusher pronto' })
  })

  it('integração desconhecida não executa o teste', async () => {
    const res = await testPOST(new NextRequest('http://x', { method: 'POST' }), params('linx'))
    expect(res.status).toBe(404)
    expect(mocks.runIntegrationTest).not.toHaveBeenCalled()
  })
})

describe('GET /api/integrations/[id]/logs', () => {
  it('repassa o cursor "after" e o limite', async () => {
    mocks.listIntegrationLogs.mockResolvedValue([])
    const res = await logsGET(new NextRequest('http://x/logs?after=2026-09-22T10:00:00.000Z&limit=50'), params('pusher'))
    expect(res.status).toBe(200)
    expect(mocks.listIntegrationLogs).toHaveBeenCalledWith('pusher', { after: new Date('2026-09-22T10:00:00.000Z'), limit: 50 })
  })
})

describe('tokens de sistema da API interna', () => {
  const noParams = { params: Promise.resolve({}) } as never

  it('GET lista os tokens ativos', async () => {
    mocks.listApiTokens.mockResolvedValue([{ id: 't1', prefixo: 'mt_sys_AbCdEfGh' }])
    const res = await tokensGET(new NextRequest('http://x'), noParams)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([{ id: 't1', prefixo: 'mt_sys_AbCdEfGh' }])
  })

  it('POST valida o nome e gera o token com o usuário local', async () => {
    const bad = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'a' }) }), noParams)
    expect(bad.status).toBe(400)
    expect(mocks.createApiToken).not.toHaveBeenCalled()

    mocks.createApiToken.mockResolvedValue({ token: 'mt_sys_x', item: { id: 't1' } })
    const res = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'Script' }) }), noParams)
    expect(res.status).toBe(201)
    expect(mocks.createApiToken).toHaveBeenCalledWith('a'.repeat(24), { nome: 'Script' })
  })

  it('DELETE revoga; token inexistente responde 404', async () => {
    mocks.revokeApiToken.mockResolvedValueOnce(undefined)
    const ok = await tokenDELETE(new NextRequest('http://x', { method: 'DELETE' }), { params: Promise.resolve({ tokenId: 't1' }) })
    expect(ok.status).toBe(200)
    expect(mocks.revokeApiToken).toHaveBeenCalledWith('a'.repeat(24), 't1')

    mocks.revokeApiToken.mockRejectedValueOnce(new DomainError(404, 'Token não encontrado'))
    const missing = await tokenDELETE(new NextRequest('http://x', { method: 'DELETE' }), { params: Promise.resolve({ tokenId: 'x' }) })
    expect(missing.status).toBe(404)
  })
})

describe('GET /api/v1/whoami', () => {
  it('responde o token usado na chamada', async () => {
    mocks.requireApiToken.mockResolvedValue({ id: 't1', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', criadoEm: '', ultimoUsoEm: null })
    const res = await whoamiGET(new NextRequest('http://x/api/v1/whoami'), { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ token: { id: 't1', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh' } })
  })

  it('401 sem token válido', async () => {
    mocks.requireApiToken.mockRejectedValue(new DomainError(401, 'Token ausente, inválido ou revogado', 'UNAUTHENTICATED'))
    const res = await whoamiGET(new NextRequest('http://x/api/v1/whoami'), { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })
})
