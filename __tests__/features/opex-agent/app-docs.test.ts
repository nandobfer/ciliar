import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  APP_DOC_AUDIENCE,
  appDocAudience,
  appDocSection,
  appDocsInstructions,
  canReadAppDoc,
  isAppDocPath,
  parseAppDoc,
  searchAppDocs,
} from '@/features/opex-agent/app-docs'
import { appDocsRoot, listAppDocPaths, readAllowedAppDocs, readAppDoc } from '@/features/opex-agent/server/app-docs'
import { docTools } from '@/features/opex-agent/server/tools/docs'
import { canUseOpexTool, OPEX_NO_PANEL_GROUPS } from '@/features/opex-agent/tool-catalog'
import { DEFAULT_OPEX_INSTRUCTIONS } from '@/features/opex-agent/constants'
import { accessFixture } from '../../helpers/access-context'

const PROVIDER = new Set(['opex.use', 'businesses.use'])
const ADMIN = new Set(['opex.use', 'admin.access'])

const SAMPLE = [
  '# Módulo: Pedidos',
  '',
  'Introdução do módulo.',
  '',
  '## Link público',
  '',
  'O orçamento é enviado por link secreto; o cliente aceita sem login.',
  '',
  '### Expiração',
  '',
  'Link expirado pode ser reenviado com novo token.',
  '',
  '## Versões',
  '',
  '```md',
  '# não é título',
  '```',
  'Cada envio cria uma versão.',
].join('\n')

const base = mkdtempSync(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'ciliar-app-docs-'))
afterAll(() => rmSync(base, { recursive: true, force: true }))

function fixtureRoot(name: string) {
  const root = join(base, name)
  mkdirSync(join(root, 'modules'), { recursive: true })
  writeFileSync(join(root, 'README.md'), '# Contexto\n\n## Módulos\n\nLista.\n')
  writeFileSync(join(root, 'modules', 'orders.md'), SAMPLE)
  writeFileSync(join(root, 'modules', 'deployment.md'), '# Docker\n\nSegredo de infraestrutura: DOCKER_MONGODB_URI.\n')
  writeFileSync(join(root, 'modules', 'novo.md'), '# Novo módulo\n\nAinda não classificado.\n')
  return root
}

describe('documentação viva: parte pura', () => {
  it('extrai título e seções, ignorando blocos de código', () => {
    const { title, sections } = parseAppDoc(SAMPLE)
    expect(title).toBe('Módulo: Pedidos')
    expect(sections.map((section) => [section.title, section.level])).toEqual([['Link público', 2], ['Expiração', 3], ['Versões', 2]])
  })

  it('lê uma seção pelo título (sem acento e parcial), até a próxima de nível igual ou maior', () => {
    const link = appDocSection(SAMPLE, 'link publico')!
    expect(link.section.title).toBe('Link público')
    expect(link.text).toContain('### Expiração')
    expect(link.text).not.toContain('Versões')
    expect(appDocSection(SAMPLE, '### expira')!.text).toBe('### Expiração\n\nLink expirado pode ser reenviado com novo token.')
    expect(appDocSection(SAMPLE, 'inexistente')).toBeNull()
  })

  it('busca sem diferença de acentos e maiúsculas, com seção, linha e trecho', () => {
    const hits = searchAppDocs([{ path: 'modules/orders.md', text: SAMPLE }], 'ORCAMENTO cliente?')
    expect(hits[0]).toMatchObject({ path: 'modules/orders.md', title: 'Módulo: Pedidos', section: 'Link público', line: 7 })
    expect(hits[0]!.snippet).toContain('orçamento é enviado')
    // Sem seção com todos os termos, valem as que têm algum.
    expect(searchAppDocs([{ path: 'modules/orders.md', text: SAMPLE }], 'versão inexistentexyz').map((hit) => hit.section)).toEqual(['Versões'])
    expect(searchAppDocs([{ path: 'modules/orders.md', text: SAMPLE }], 'x')).toEqual([])
  })

  it('público por arquivo: prestador não lê os restritos; fora do mapa é restrito; caminhos inválidos nunca', () => {
    expect(canReadAppDoc('modules/orders.md', PROVIDER)).toBe(true)
    for (const path of ['modules/deployment.md', 'modules/integrations.md', 'modules/access.md', 'modules/novo.md']) {
      expect(canReadAppDoc(path, PROVIDER)).toBe(false)
      expect(canReadAppDoc(path, ADMIN)).toBe(true)
      expect(canReadAppDoc(path, new Set(['*']))).toBe(true)
    }
    expect(appDocAudience('modules/novo.md')).toBe('admin')
    for (const path of ['../AGENTS.md', '/etc/passwd', 'modules/../README.md', 'modules/orders.txt', 'modules/sub/a.md', 'Modules/orders.md']) {
      expect(isAppDocPath(path)).toBe(false)
      expect(canReadAppDoc(path, new Set(['*']))).toBe(false)
    }
  })

  it('todo documento real de aicontext/ está classificado no mapa de público', () => {
    const real = ['README.md', ...readdirSync(join(appDocsRoot(), 'modules')).filter((name) => name.endsWith('.md')).map((name) => `modules/${name}`)]
    expect(real.filter((path) => !(path in APP_DOC_AUDIENCE))).toEqual([])
    expect(Object.keys(APP_DOC_AUDIENCE).filter((path) => !real.includes(path))).toEqual([])
  })

  it('instruções: consultar antes de responder; linguagem da tela para quem não administra', () => {
    expect(DEFAULT_OPEX_INSTRUCTIONS).toContain('search_app_docs')
    const provider = appDocsInstructions(PROVIDER)
    expect(provider).toContain('ANTES de responder')
    expect(provider).toContain('linguagem da tela')
    expect(appDocsInstructions(ADMIN)).toContain('detalhes técnicos')
    expect(appDocsInstructions(ADMIN)).not.toContain('linguagem da tela')
  })
})

describe('documentação viva: leitura do disco', () => {
  it('lista README e módulos, e filtra pelos permitidos', async () => {
    const root = fixtureRoot('list')
    expect(await listAppDocPaths(root)).toEqual(['README.md', 'modules/deployment.md', 'modules/novo.md', 'modules/orders.md'])
    expect((await readAllowedAppDocs(PROVIDER, root)).map((doc) => doc.path)).toEqual(['README.md', 'modules/orders.md'])
    expect((await readAllowedAppDocs(ADMIN, root)).map((doc) => doc.path)).toHaveLength(4)
  })

  it('restrito, inexistente, inválido e link simbólico dão o mesmo erro', async () => {
    const root = fixtureRoot('guard')
    writeFileSync(join(base, 'fora.md'), '# Fora\n')
    symlinkSync(join(base, 'fora.md'), join(root, 'modules', 'link.md'))
    for (const path of ['modules/deployment.md', 'modules/nada.md', '../fora.md', 'modules/link.md']) {
      const permissions = path === 'modules/deployment.md' ? PROVIDER : new Set(['*'])
      await expect(readAppDoc(path, permissions, root)).rejects.toThrow(/não encontrado ou não disponível/)
    }
    expect(await listAppDocPaths(root)).not.toContain('modules/link.md')
    expect((await readAppDoc('./aicontext/modules/orders.md', PROVIDER, root)).path).toBe('modules/orders.md')
  })

  it('reflete a alteração do arquivo na leitura seguinte, sem cache nem reinício', async () => {
    const root = fixtureRoot('live')
    expect((await readAppDoc('modules/orders.md', PROVIDER, root)).text).toContain('link secreto')
    writeFileSync(join(root, 'modules', 'orders.md'), '# Pedidos\n\n## Link público\n\nAgora o link vale 30 dias.\n')
    const doc = await readAppDoc('modules/orders.md', PROVIDER, root)
    expect(doc.text).toContain('30 dias')
    expect(searchAppDocs([doc], '30 dias')[0]!.section).toBe('Link público')
  })
})

describe('documentação viva: ferramentas', () => {
  const tool = (name: string) => docTools.find((item) => item.name === name)!
  const run = (name: string, input: unknown, keys: string[]) => tool(name).execute(tool(name).input.parse(input), { sessionId: 's', actorId: 'a'.repeat(24), scope: { userId: 'a'.repeat(24), viewAsHeader: 'none', sessionVersion: 0 }, access: accessFixture(keys) })

  it('são de leitura, sem painel e liberadas para quem usa o agente', () => {
    expect(OPEX_NO_PANEL_GROUPS.has('docs')).toBe(true)
    for (const item of docTools) {
      expect(item.risk).toBe('read')
      expect(canUseOpexTool(item, PROVIDER)).toBe(true)
    }
  })

  it('consultam o aicontext real do projeto respeitando o público', async () => {
    const providerList = (await run('list_app_docs', {}, [...PROVIDER])) as { docs: { path: string; sections: string[] }[] }
    const paths = providerList.docs.map((doc) => doc.path)
    expect(paths).toEqual(expect.arrayContaining(['README.md', 'modules/orders.md', 'modules/works.md']))
    expect(paths).not.toContain('modules/deployment.md')
    const adminList = (await run('list_app_docs', {}, ['admin.access'])) as { docs: { path: string }[] }
    expect(adminList.docs.map((doc) => doc.path)).toContain('modules/deployment.md')

    const search = (await run('search_app_docs', { query: 'link público do orçamento' }, [...PROVIDER])) as { hits: { path: string }[] }
    expect(search.hits.length).toBeGreaterThan(0)
    expect(search.hits.every((hit) => hit.path !== 'modules/deployment.md')).toBe(true)

    const read = (await run('read_app_doc', { path: 'modules/orders.md', limit: 200 }, [...PROVIDER])) as { text: string; truncated: boolean; total: number }
    expect(read.text.length).toBe(200)
    expect(read.truncated).toBe(true)
    await expect(run('read_app_doc', { path: 'modules/deployment.md' }, [...PROVIDER])).rejects.toThrow(/não encontrado ou não disponível/)
    await expect(run('read_app_doc', { path: 'modules/orders.md', section: 'seção que não existe' }, [...PROVIDER])).rejects.toThrow(/Seções:/)
  })
})
