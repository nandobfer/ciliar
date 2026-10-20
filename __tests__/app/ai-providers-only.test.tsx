/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, render as baseRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../helpers/framer-motion'
import { getIntegrationDef, INTEGRATIONS } from '@/lib/integrations/catalog'
import type { IntegrationDetailDto } from '@/features/integrations/types'
import { draftFrom } from '@/features/integrations/components/detail/draft'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/integrations/hooks/useIntegrationStatusLive', () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock('@/features/integrations/hooks/useIntegrations', () => ({
    useIntegrations: () => ({ data: INTEGRATIONS.filter((def) => def.parent === 'ai').map((def) => ({ ...def, health: { status: 'unknown' }, configured: false })), isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/features/integrations/components/IntegrationTestDialog', () => ({ IntegrationTestDialog: () => null }))
import { AiEditorForm } from '@/features/ai/components/AiEditorForm'
import { SidebarFooter } from '@/features/layout/components/sidebar/SidebarFooter'

afterEach(() => cleanup())
vi.mock('@/features/opex-agent/components/settings/OpexAgentTab', () => ({ OpexAgentTab: () => <p>Configuração do agente</p> }))
const render = (ui: React.ReactElement) => baseRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const data: IntegrationDetailDto = {
    id: 'ai', name: 'Provedores de IA', description: '', environment: 'externo', debugMode: false,
    publicValues: {}, secrets: {}, encryptionKeyConfigured: true, stored: false, health: { status: 'unknown' },
}

describe('interface copiada: Provedores, agentes e Resumo', () => {
    it('mostra as abas Provedores, Agente Opex, Agente Entrevistador e Resumo, com os cards dos provedores navegáveis', () => {
        render(<AiEditorForm def={getIntegrationDef('ai')} data={data} draft={draftFrom(data)} setDraft={vi.fn()} dirty={false} pending={false} onSave={vi.fn()} onUndo={vi.fn()} />)
        expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Provedores', 'Agente Opex', 'Agente Entrevistador', 'Resumo'])
        for (const provider of ['OpenCode', 'Gemini', 'Anthropic', 'OpenAI', 'DeepSeek', 'JEV']) expect(screen.getByRole('link', { name: new RegExp(provider) })).toBeTruthy()
        expect(screen.queryByText('Entender tarefas')).toBeNull()
        expect(screen.queryByText('Desenvolvimento agêntico')).toBeNull()
    })

    it('ignora uma aba removida pedida por URL e oferece logout no rodapé', () => {
        window.history.replaceState(null, '', '/integracoes/ia?aba=entender-tarefas')
        render(<AiEditorForm def={getIntegrationDef('ai')} data={data} draft={draftFrom(data)} setDraft={vi.fn()} dirty={false} pending={false} onSave={vi.fn()} onUndo={vi.fn()} />)
        expect(screen.getByRole('tab', { name: 'Provedores' }).getAttribute('aria-selected')).toBe('true')
        cleanup()
        render(<SidebarFooter collapsed={false} ownerName="Ciliar" version="0.1.0" />)
        expect(screen.queryByText('Acesso público')).toBeNull()
        expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy()
        window.history.replaceState(null, '', '/')
    })
})
