import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_NAV_ITEMS, HOME_HREF, activeNavHref } from '@/features/layout/navigation'
import { DEFAULT_CRON_JOBS, INTEGRATIONS, INTEGRATION_IDS, IN_DEVELOPMENT_INTEGRATIONS, getIntegrationDef, integrationPath, isIntegrationId } from '@/lib/integrations/catalog'
import { AI_TABS } from '@/features/ai/constants'
import { buildIntegrationUpdateSchema } from '@/features/integrations/schemas/integration.schema'
import { withBuiltInJobs } from '@/lib/integrations/config'
import { buildPublicApiSpec } from '@/features/public-api/openapi/spec'

describe('base do Ciliar com controle de acesso', () => {
    it('inclui Integrações, Usuários e Perfis, preservando a página inicial', () => {
        expect(APP_NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([{ href: '/integracoes', label: 'Integrações' }, { href: '/usuarios', label: 'Usuários' }, { href: '/perfis', label: 'Perfis' }])
        expect(HOME_HREF).toBe('/integracoes')
        expect(activeNavHref('/integracoes/ia/opencode', APP_NAV_ITEMS)).toBe('/integracoes')
        expect(activeNavHref('/tarefas', APP_NAV_ITEMS)).toBeNull()
    })

    it('expõe exatamente as seis integrações solicitadas e os provedores filhos (Anthropic, OpenAI e DeepSeek como no Opex)', () => {
        expect(INTEGRATIONS.filter((def) => !def.parent).map((def) => def.id)).toEqual(['pusher', 'internal_api', 'crons', 'ai', 'smtp', 'storage_s3'])
        expect(INTEGRATIONS.filter((def) => def.parent === 'ai').map((def) => def.id)).toEqual(['ai_opencode', 'ai_gemini', 'ai_anthropic', 'ai_openai', 'ai_deepseek', 'ai_jev'])
        expect(INTEGRATIONS.map((def) => def.id)).toEqual([...INTEGRATION_IDS])
        expect(IN_DEVELOPMENT_INTEGRATIONS).toEqual([])
        for (const id of ['github', 'orcamentos', 'google_drive', 'desconhecido']) expect(isIntegrationId(id)).toBe(false)
        expect(AI_TABS).toEqual(['provedores', 'agente-opex'])
        expect(integrationPath('ai_opencode')).toBe('/integracoes/ia/opencode')
    })

    it('mantém o motor de crons sem cadastrar rotinas de módulos excluídos (só a limpeza dos arquivos do agente)', () => {
        expect(DEFAULT_CRON_JOBS).toEqual([
            { id: 'integrations-health-check', label: 'Verificação de status das integrações', kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 5 } },
            { id: 'opex-files-cleanup', label: 'Limpar arquivos pendentes do chat do Agente Opex', kind: 'internal', enabled: true, schedule: { type: 'interval', minutes: 60 } },
        ])
        expect(withBuiltInJobs([])).toEqual(DEFAULT_CRON_JOBS)
        const schema = buildIntegrationUpdateSchema(getIntegrationDef('crons'))
        expect(schema.safeParse({ publicValues: { jobs: DEFAULT_CRON_JOBS } }).success).toBe(true)
        expect(schema.safeParse({ publicValues: { jobs: [{ ...DEFAULT_CRON_JOBS[0], schedule: { type: 'daily', time: '99:00' } }] } }).success).toBe(false)
    })

    it('mantém os campos privados somente nas integrações correspondentes', () => {
        const smtp = buildIntegrationUpdateSchema(getIntegrationDef('smtp'))
        expect(smtp.safeParse({ publicValues: { host: 'smtp.exemplo.com', port: 465 }, secrets: { password: { action: 'set', value: 'teste' } } }).success).toBe(true)
        expect(smtp.safeParse({ publicValues: { port: 70000 } }).success).toBe(false)
        expect(smtp.safeParse({ secrets: { accessKey: { action: 'set', value: 'teste' } } }).success).toBe(false)
        const pusher = buildIntegrationUpdateSchema(getIntegrationDef('pusher'))
        expect(pusher.safeParse({ publicValues: { mode: 'host', url: 'http://localhost:6001' } }).success).toBe(true)
        expect(pusher.safeParse({ publicValues: { mode: 'outro' } }).success).toBe(false)
    })

    it('inclui autenticação sem trazer portal ou módulos de negócio do Opex', () => {
        for (const file of ['src/middleware.ts', 'src/proxy.ts', 'src/app/cliente', 'src/features/tasks', 'src/features/agentic', 'src/features/github', 'src/features/orcamentos']) {
            expect(existsSync(resolve(file)), file).toBe(false)
        }
        expect(existsSync(resolve('src/features/auth'))).toBe(true)
        expect(existsSync(resolve('src/app/login'))).toBe(true)
        const root = readFileSync(resolve('src/app/layout.tsx'), 'utf8')
        expect(root).toContain('title: "Ciliar"')
        expect(root).toContain('className="dark"')
        expect(buildPublicApiSpec()).toMatchObject({ info: { title: 'API interna do Ciliar' } })
    })
})
