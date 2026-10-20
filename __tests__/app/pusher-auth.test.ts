import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { INTEGRATION_IDS } from '@/lib/integrations/catalog'
import { isChannelAuthorized } from '@/lib/pusher/channel-auth'
import { accessFixture } from '../helpers/access-context'

const mocks = vi.hoisted(() => ({ authorizeChannel: vi.fn(), getPusherServer: vi.fn(), auth: vi.fn(), resolveAccess: vi.fn() }))
vi.mock('@/lib/pusher/server', () => ({ getPusherServer: mocks.getPusherServer }))
vi.mock('@/auth', () => ({ auth: mocks.auth }))
vi.mock('@/features/access/server/access', async importOriginal => ({ ...await importOriginal<object>(), resolveAccess: mocks.resolveAccess }))
import { POST } from '@/app/api/pusher/auth/route'

beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPusherServer.mockResolvedValue({ authorizeChannel: mocks.authorizeChannel })
    mocks.authorizeChannel.mockReturnValue({ auth: 'assinatura-de-teste' })
    mocks.auth.mockResolvedValue({ user: { id: 'a'.repeat(24), sessionVersion: 0 } })
    mocks.resolveAccess.mockResolvedValue(accessFixture())
    process.env.APP_ORIGIN = 'http://localhost:3101'
})

const request = (channel: string) => new NextRequest('http://localhost:3101/api/pusher/auth', {
    method: 'POST',
    headers: { origin: 'http://localhost:3101', 'x-ciliar-request': '1' },
    body: new URLSearchParams({ socket_id: '123.456', channel_name: channel }),
})

describe('Pusher autenticado por sessão e permissão', () => {
    it('autoriza canais conhecidos para Administrador', async () => {
        expect(isChannelAuthorized('private-app', new Set(['*']))).toBe(true)
        for (const id of INTEGRATION_IDS) expect(isChannelAuthorized(`private-integration-${id}`, new Set(['*']))).toBe(true)
        const response = await POST(request('private-integration-pusher'))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ auth: 'assinatura-de-teste' })
        expect(mocks.authorizeChannel).toHaveBeenCalledWith('123.456', 'private-integration-pusher')
    })

    it('recusa canais arbitrários, de módulos excluídos ou do antigo portal', async () => {
        for (const channel of ['private-unknown', 'private-integration-github', 'private-integration-orcamentos', 'private-client-123', 'private-repo-recents-local']) {
            expect(isChannelAuthorized(channel, new Set(['*']))).toBe(false)
            expect((await POST(request(channel))).status).toBe(403)
        }
        expect(mocks.authorizeChannel).not.toHaveBeenCalled()
    })

    it('informa parâmetros ausentes e Pusher não configurado sem falso sucesso', async () => {
        expect((await POST(request(''))).status).toBe(400)
        mocks.getPusherServer.mockRejectedValue(new Error('não configurado'))
        expect((await POST(request('private-app'))).status).toBe(503)
    })
    it('recusa anônimos e limita os canais ao acesso efetivo da simulação', async () => {
        mocks.auth.mockResolvedValue(null)
        expect((await POST(request('private-app'))).status).toBe(401)
        mocks.auth.mockResolvedValue({ user: { id: 'a'.repeat(24), sessionVersion: 0 } })
        mocks.resolveAccess.mockResolvedValue(accessFixture(['admin.access', 'integrations.smtp.view']))
        expect((await POST(request('private-app'))).status).toBe(403)
        expect((await POST(request('private-integration-pusher'))).status).toBe(403)
        expect((await POST(request('private-integration-smtp'))).status).toBe(200)
    })
})
