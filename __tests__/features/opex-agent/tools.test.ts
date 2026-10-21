import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  settings: { enabled: true, disabledTools: [] as string[] },
  resolveAccess: vi.fn(),
}))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/opex-agent/server/settings', async (original) => ({
  ...(await original<object>()),
  loadOpexSettings: async () => ({ settings: { ...mocks.settings }, isDefault: false, updatedAt: null }),
}))
vi.mock('@/features/access/server/access', async (original) => ({ ...(await original<object>()), resolveAccess: mocks.resolveAccess }))

import { catalog as accessCatalog } from '@/features/access/catalog'
import { requestAccess } from '@/features/access/server/context'
import { OPEX_TOOL_GROUPS, DEFAULT_OPEX_INSTRUCTIONS } from '@/features/opex-agent/constants'
import {
  canUseOpexTool,
  disabledOpexToolNames,
  enabledOpexToolNames,
  OPEX_ALWAYS_ON_TOOLS,
  OPEX_TOOL_CATALOG,
  OPEX_TOOL_TREE,
  opexToolTreeCatalog,
} from '@/features/opex-agent/tool-catalog'
import { authorizeOpexTool } from '@/features/opex-agent/server/authorize'
import { defineTool, type OpexTool } from '@/features/opex-agent/server/tools/define'
import { enabledOpexTools, findOpexTool, needsConfirmation, OPEX_TOOLS } from '@/features/opex-agent/server/tools/registry'
import { buildToolRuntime, compactToolOutput, MAX_TOOL_OUTPUT_CHARS } from '@/features/opex-agent/server/tool-runtime'
import { normalizeOpexSettings, withDefaults } from '@/features/opex-agent/server/settings'
import { DEFAULT_OPEX_AGENT_SETTINGS } from '@/features/opex-agent/schemas'
import { parseOpexUserChannel, opexTabsStorageKey } from '@/features/opex-agent/scope'
import { isChannelAuthorized } from '@/lib/pusher/channel-auth'
import { routePermissions } from '@/features/access/server/policy'
import { accessFixture } from '../../helpers/access-context'

type Executable = { execute: (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => Promise<unknown> }

const SCOPE = { userId: 'a'.repeat(24), viewAsHeader: 'none', sessionVersion: 0 }
const context = { sessionId: 's1', actorId: SCOPE.userId, scope: SCOPE }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings = { enabled: true, disabledTools: [] }
})

describe('catálogo e registro de ferramentas', () => {
  it('cada ferramenta do catálogo tem implementação e vice-versa, com nomes únicos aceitos pelos provedores', () => {
    const names = OPEX_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual(OPEX_TOOL_CATALOG.map((tool) => tool.name).sort())
    for (const tool of OPEX_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/)
      expect(tool.label.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(OPEX_TOOL_GROUPS).toContain(tool.group)
    }
    for (const group of OPEX_TOOL_GROUPS) expect(OPEX_TOOLS.some((tool) => tool.group === group)).toBe(true)
  })

  it('só existem ferramentas de negócios (clientes e pedidos inclusive), usuários, perfis, integrações (tokens e rotinas), plataforma, arquivos e contexto', () => {
    expect(OPEX_TOOL_GROUPS).toEqual(['context', 'files', 'businesses', 'business-activities', 'business-goals', 'business-documents', 'business-successes', 'clients', 'orders', 'memories', 'users', 'roles', 'integrations', 'api-tokens', 'routines', 'platform'])
    expect(OPEX_TOOLS.some((tool) => tool.name === 'create_business')).toBe(false)
    expect(OPEX_TOOLS.some((tool) => /task|preview|workbench|central|service|finance/.test(tool.name))).toBe(false)
  })

  it('toda permissão exigida existe no catálogo do Perfix', () => {
    for (const tool of OPEX_TOOL_CATALOG) {
      for (const key of [...(tool.access.all ?? []), ...(tool.access.any ?? [])]) expect({ tool: tool.name, key, known: accessCatalog.isKnownKey(key) }).toEqual({ tool: tool.name, key, known: true })
    }
  })

  it('exclusão, credencial, senha, token e mudança de autoridade (perfis, usuários, integrações) são destructive e têm o resumo do card', () => {
    // Editar a ficha e os itens do próprio negócio não é autoridade nem credencial: `write` (M1/M2).
    const ownBusinessWrites = ['update_business', ...['activity', 'goal', 'document', 'success', 'client', 'order'].flatMap((item) => [`create_${item}`, `update_${item}`])]
    const sensitive = OPEX_TOOLS.filter(
      (tool) =>
        // Memórias: criar/editar são `write` (a confirmação é ajustável por ferramenta).
        (/^(delete|revoke|create|update|reorder)_/.test(tool.name) && ![...ownBusinessWrites, 'create_agent_memory', 'update_agent_memory'].includes(tool.name)) || (/token|password/.test(tool.name) && !/^list_/.test(tool.name)),
    )
    const risk = (name: string) => findOpexTool(name)!.risk
    expect(['list_businesses', 'get_business', 'get_business_interview'].map(risk)).toEqual(['read', 'read', 'read'])
    expect(['update_business', 'restore_business', 'archive_business', 'delete_business'].map(risk)).toEqual(['write', 'write', 'destructive', 'destructive'])
    expect(sensitive.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['create_user', 'update_user', 'delete_user', 'create_role', 'update_role', 'reorder_roles', 'delete_role', 'update_integration', 'create_api_token', 'revoke_api_token', 'update_platform_settings', 'update_legal_terms']),
    )
    for (const tool of sensitive) expect({ name: tool.name, risk: tool.risk }).toEqual({ name: tool.name, risk: 'destructive' })
    for (const tool of OPEX_TOOLS.filter((item) => item.risk !== 'read')) expect(typeof tool.summarize).toBe('function')
  })

  it('convite não tem senha; segredos saem da entrada exibida e do histórico', () => {
    const createUser = findOpexTool('create_user')!
    const input = createUser.input.parse({ name: 'Ana', email: 'ana@example.test', password: 'Senha-segura-123', roleIds: ['b'.repeat(24)] }) as Record<string, unknown>
    expect(input).not.toHaveProperty('password')
    expect(input).toMatchObject({ sendInvite: false, active: true })
    const update = findOpexTool('update_integration')!
    const secret = update.input.parse({ id: 'smtp', secrets: [{ key: 'password', value: 'segredo-smtp' }] })
    expect(JSON.stringify(update.redact!(secret))).not.toContain('segredo-smtp')
  })

  it('as instruções descrevem o Ciliar e o token exibido no card', () => {
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain('Ciliar')
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain('card de criação')
  })
})

describe('ferramentas ligadas e permissões', () => {
  it('a nova ferramenta nasce ligada; o contexto nunca sai', () => {
    expect(enabledOpexToolNames([])).toEqual(OPEX_TOOL_CATALOG.map((tool) => tool.name))
    expect(enabledOpexToolNames(['get_app_overview', 'delete_user'])).toContain('get_app_overview')
    expect(enabledOpexToolNames(['delete_user'])).not.toContain('delete_user')
    expect(disabledOpexToolNames(['get_app_overview'])).not.toContain('get_app_overview')
    expect(OPEX_ALWAYS_ON_TOOLS).toEqual(new Set(['get_app_overview']))
  })

  it('o turno só recebe as ferramentas ligadas e permitidas pelas permissões efetivas', () => {
    const viewer = new Set(['admin.access', 'opex.use', 'users.view'])
    const names = enabledOpexTools(['list_chat_files'], viewer).map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['get_app_overview', 'read_chat_file', 'list_users', 'get_user']))
    expect(names).not.toContain('list_chat_files')
    expect(names).not.toContain('create_user')
    expect(names).not.toContain('list_roles')
    expect(names).not.toContain('create_api_token')
    expect(enabledOpexTools([], new Set(['*'])).length).toBe(OPEX_TOOLS.length)
  })

  it('prestador sem o painel: só contexto, arquivos e negócios; a administração segue exigindo admin.access', () => {
    const provider = new Set(['opex.use', 'businesses.use', 'users.view'])
    const names = enabledOpexTools([], provider).map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['get_app_overview', 'list_chat_files', 'list_businesses', 'update_business', 'delete_business']))
    expect(names).not.toContain('list_users')
    expect(canUseOpexTool(findOpexTool('get_business')!, new Set(['businesses.view_all']))).toBe(true)
    expect(canUseOpexTool(findOpexTool('update_business')!, new Set(['businesses.view_all']))).toBe(false)
  })

  it('integrações: basta ver alguma para listar; editar exige a permissão da integração alvo', () => {
    const smtp = new Set(['admin.access', 'integrations.smtp.view'])
    expect(canUseOpexTool(findOpexTool('list_integrations')!, smtp)).toBe(true)
    expect(canUseOpexTool(findOpexTool('update_integration')!, smtp)).toBe(false)
    const tool = findOpexTool('update_integration')!
    const access = accessFixture(['admin.access', 'integrations.smtp.view', 'integrations.smtp.edit'])
    expect(() => tool.authorize!(tool.input.parse({ id: 'smtp' }), access)).not.toThrow()
    expect(() => tool.authorize!(tool.input.parse({ id: 'pusher' }), access)).toThrow()
  })

  it('o teste agregado do hub de IA exige o teste de cada provedor', () => {
    const tool = findOpexTool('test_integration')!
    const access = accessFixture(['admin.access', 'integrations.ai.test'])
    expect(() => tool.authorize!(tool.input.parse({ id: 'ai' }), access)).toThrow()
  })

  it('árvore da configuração: um módulo por grupo, folhas por ferramenta e destrutivas como sensíveis', () => {
    expect(OPEX_TOOL_TREE.map((branch) => branch.label)).toEqual(['Contexto', 'Arquivos do chat', 'Negócios', 'Atividades do negócio', 'Metas do negócio', 'Documentos do negócio', 'Sucessos do negócio', 'Clientes', 'Pedidos', 'Memórias dos agentes', 'Usuários', 'Perfis', 'Integrações', 'Tokens da API interna', 'Rotinas', 'Plataforma'])
    expect(opexToolTreeCatalog.keys).toEqual(OPEX_TOOL_CATALOG.map((tool) => tool.name))
    const users = OPEX_TOOL_TREE.find((branch) => branch.id === 'tools_users')!
    expect(users.children).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'delete_user', sensitive: true })]))
    // Sem viewKey: marcar uma ferramenta não liga outra.
    expect(opexToolTreeCatalog.isRequiredView('list_users', new Set(['list_users', 'delete_user']))).toBe(false)
  })

  it('configuração: nomes fora do catálogo dão 400; salvos antigos somem; normaliza as desligadas', () => {
    expect(() => normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, disabledTools: ['delete_task'] })).toThrow(expect.objectContaining({ status: 400, code: 'OPEX_TOOL_UNKNOWN' }))
    expect(normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, disabledTools: ['delete_user', 'delete_user', 'get_app_overview'] }).disabledTools).toEqual(['delete_user'])
    expect((withDefaults({ disabledTools: ['delete_task', 'delete_user'] }) as { disabledTools: string[] }).disabledTools).toEqual(['delete_user'])
    // Confirmação por ferramenta: salva antiga ganha `{}`; só o que difere do padrão é guardado.
    expect((withDefaults({ confirmationOverrides: { delete_task: true, list_users: true } }) as { confirmationOverrides: object }).confirmationOverrides).toEqual({ list_users: true })
    expect(normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, confirmationOverrides: { delete_user: true, update_business: true, list_users: false } }).confirmationOverrides).toEqual({ update_business: true })
    expect(() => normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, confirmationOverrides: { delete_task: true } })).toThrow(expect.objectContaining({ code: 'OPEX_TOOL_UNKNOWN' }))
  })
})

describe('autorização antes de cada ferramenta', () => {
  const listUsers = () => findOpexTool('list_users')!

  it('relê o acesso com o usuário real, a simulação e a versão da sessão', async () => {
    const access = accessFixture(['admin.access', 'opex.use', 'users.view'])
    mocks.resolveAccess.mockResolvedValue(access)
    await expect(authorizeOpexTool(listUsers(), {}, { ...SCOPE, viewAsHeader: 'v1.cargo.x', sessionVersion: 3 })).resolves.toBe(access)
    expect(mocks.resolveAccess).toHaveBeenCalledWith(SCOPE.userId, 'v1.cargo.x', null, 3)
  })

  it('permissão perdida, chat bloqueado, ferramenta desligada ou agente desativado recusam', async () => {
    mocks.resolveAccess.mockResolvedValue(accessFixture(['admin.access', 'opex.use']))
    await expect(authorizeOpexTool(listUsers(), {}, SCOPE)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('users.view') })
    mocks.resolveAccess.mockResolvedValue(accessFixture(['admin.access', 'users.view']))
    await expect(authorizeOpexTool(listUsers(), {}, SCOPE)).rejects.toMatchObject({ status: 403 })
    mocks.resolveAccess.mockResolvedValue(accessFixture(['*']))
    mocks.settings = { enabled: true, disabledTools: ['list_users'] }
    await expect(authorizeOpexTool(listUsers(), {}, SCOPE)).rejects.toThrow(/desligada/)
    mocks.settings = { enabled: false, disabledTools: [] }
    await expect(authorizeOpexTool(listUsers(), {}, SCOPE)).rejects.toThrow(/desativado/)
  })

  it('termos sem aceite da versão vigente recusam', async () => {
    mocks.resolveAccess.mockResolvedValue({ ...accessFixture(['*']), legalAcceptanceRequired: true, legalVersion: 2 })
    await expect(authorizeOpexTool(listUsers(), {}, SCOPE)).rejects.toMatchObject({ code: 'TERMS_ACCEPTANCE_REQUIRED' })
  })
})

describe('runtime das ferramentas', () => {
  const execute = vi.fn(async (input: { x: number }) => ({ value: input.x }))
  const fake = { ...defineTool('list_users', { input: z.object({ x: z.number() }), execute }) } as unknown as OpexTool
  const destructive = { ...fake, name: 'delete_user', risk: 'destructive', summarize: () => 'Excluir' } as unknown as OpexTool

  it('autoriza com a entrada validada e executa no contexto de acesso revalidado', async () => {
    const access = accessFixture(['admin.access', 'opex.use', 'users.view'])
    let seen: unknown = null
    execute.mockImplementationOnce(async (input) => {
      seen = requestAccess.getStore()
      return { value: input.x }
    })
    const authorize = vi.fn(async () => access)
    const runtime = buildToolRuntime([fake], context, 'destructive', { authorize, requestConfirmation: vi.fn() })
    await expect((runtime.tools.list_users as unknown as Executable).execute({ x: 2 }, { toolCallId: 'c1' })).resolves.toEqual({ value: 2 })
    expect(authorize).toHaveBeenCalledWith(fake, { x: 2 })
    expect(execute).toHaveBeenCalledWith({ x: 2 }, expect.objectContaining({ access, sessionId: 's1' }))
    expect(seen).toBe(access)
  })

  it('autorização negada vira erro para o modelo, sem executar nem pedir confirmação', async () => {
    const requestConfirmation = vi.fn()
    const runtime = buildToolRuntime([destructive], context, 'destructive', { authorize: async () => Promise.reject(new Error('Seu acesso não permite usar delete_user')), requestConfirmation })
    await expect((runtime.tools.delete_user as unknown as Executable).execute({ x: 1 }, { toolCallId: 'c2' })).rejects.toThrow('não permite')
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('destrutiva pede confirmação em vez de executar', async () => {
    const requestConfirmation = vi.fn(async () => ({ actionId: 'a1', summary: 'Excluir', status: 'pending' as const, error: null }))
    const runtime = buildToolRuntime([destructive], context, 'destructive', { authorize: async () => accessFixture(), requestConfirmation })
    const result = await (runtime.tools.delete_user as unknown as Executable).execute({ x: 1 }, { toolCallId: 'c3' })
    expect(result).toMatchObject({ status: 'confirmation_required', actionId: 'a1' })
    expect(execute).not.toHaveBeenCalled()
    expect(runtime.confirmations.get('c3')).toMatchObject({ actionId: 'a1' })
  })

  it('destrutiva com a confirmação desligada na configuração executa direto', async () => {
    const requestConfirmation = vi.fn()
    const runtime = buildToolRuntime([destructive], context, { policy: 'destructive', overrides: { delete_user: false } }, { authorize: async () => accessFixture(), requestConfirmation })
    await expect((runtime.tools.delete_user as unknown as Executable).execute({ x: 5 }, { toolCallId: 'c4' })).resolves.toEqual({ value: 5 })
    expect(requestConfirmation).not.toHaveBeenCalled()
  })

  it('política "Toda alteração" confirma as de escrita; leitura nunca', () => {
    const write = { ...fake, risk: 'write' } as OpexTool
    expect(needsConfirmation(write, 'writes')).toBe(true)
    expect(needsConfirmation(write, 'destructive')).toBe(false)
    expect(needsConfirmation(fake, 'writes')).toBe(false)
    // Ajuste por ferramenta vence o padrão do risco (inclusive leitura e destrutiva).
    expect(needsConfirmation(write, 'destructive', { [write.name]: true })).toBe(true)
    expect(needsConfirmation(fake, 'destructive', { [fake.name]: true })).toBe(true)
    expect(needsConfirmation(findOpexTool('delete_user')!, 'destructive', { delete_user: false })).toBe(false)
    expect(needsConfirmation(findOpexTool('delete_user')!, 'destructive', { other_tool: false })).toBe(true)
  })

  it('saída grande é cortada com aviso', () => {
    const big = compactToolOutput({ text: 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 10) }) as { truncated: boolean }
    expect(big.truncated).toBe(true)
  })
})

describe('canal e rotas do agente', () => {
  it('cada usuário só assina o próprio canal privado, com opex.use', () => {
    const userId = 'a'.repeat(24)
    const allowed = new Set(['admin.access', 'opex.use'])
    expect(isChannelAuthorized(`private-opex-${userId}`, allowed, userId)).toBe(true)
    expect(isChannelAuthorized(`private-opex-${'b'.repeat(24)}`, allowed, userId)).toBe(false)
    expect(isChannelAuthorized(`private-opex-${userId}`, new Set(['admin.access']), userId)).toBe(false)
    expect(parseOpexUserChannel(`private-opex-${userId}`)).toBe(userId)
    expect(opexTabsStorageKey(userId)).toContain(userId)
  })

  it('"Ver informações técnicas" fica no ramo Agente Opex e depende de usar o chat', () => {
    expect(accessCatalog.isKnownKey('opex.technical')).toBe(true)
    expect(accessCatalog.normalizePermissionDependencies(['opex.technical'])).toEqual(expect.arrayContaining(['opex.technical', 'opex.use']))
  })

  it('rotas do chat exigem opex.use; a configuração exige ver/editar a integração de IA', () => {
    expect(routePermissions('/api/opex/sessions', 'GET')).toEqual(['opex.use'])
    expect(routePermissions(`/api/opex/actions/${'a'.repeat(24)}`, 'POST')).toEqual(['opex.use'])
    expect(routePermissions('/api/opex/status', 'GET')).toEqual(['opex.use'])
    expect(routePermissions('/api/ai/features/opex-agent', 'GET')).toEqual(['integrations.ai.view'])
    expect(routePermissions('/api/ai/features/opex-agent', 'PUT')).toEqual(['integrations.ai.edit'])
    expect(routePermissions('/api/ai/providers/anthropic/models', 'GET')).toEqual(['integrations.ai_anthropic.view'])
  })
})
