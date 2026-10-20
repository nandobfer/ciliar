/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { framerMotionMock } from '../../helpers/framer-motion'

const net = vi.hoisted(() => ({
  post: vi.fn(),
  del: vi.fn(async () => ({ data: { success: true } })),
  put: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('axios', () => ({ default: { put: net.put } }))
vi.mock('@/lib/api', () => ({
  api: { post: net.post, delete: net.del },
  unwrapApi: (response: { data: unknown }) => response.data,
  apiErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
}))

import { OpexToolCard } from '@/features/opex-agent/components/chat/OpexToolCard'
import { AssistantMessage, UserMessage } from '@/features/opex-agent/components/chat/OpexMessageItem'
import { OpexSessionTabs } from '@/features/opex-agent/components/OpexSessionTabs'
import { OpexAttachmentChips } from '@/features/opex-agent/components/chat/OpexAttachmentChips'
import { OpexComposer } from '@/features/opex-agent/components/chat/OpexComposer'
import { OpexUploadsProvider, useOpexUploads, type OpexUploadItem } from '@/features/opex-agent/hooks/useOpexUploads'
import { useForm } from 'react-hook-form'
import { OpexToolsCard } from '@/features/opex-agent/components/settings/OpexToolsCard'
import { OPEX_TOOL_CATALOG } from '@/features/opex-agent/tool-catalog'
import { DEFAULT_OPEX_AGENT_SETTINGS, type OpexAgentSettings } from '@/features/opex-agent/schemas'
import type { OpexMessageDto, OpexPart, OpexSessionDto } from '@/features/opex-agent/types'

type ToolPart = Extract<OpexPart, { type: 'tool' }>

afterEach(cleanup)

const toolPart = (overrides: Partial<ToolPart> = {}): ToolPart => ({
  type: 'tool',
  id: 't1',
  name: 'delete_user',
  group: 'users',
  label: 'Excluir usuário',
  state: 'done',
  input: '{"user":"ana@example.test"}',
  output: null,
  error: null,
  confirmation: null,
  durationMs: 1500,
  ...overrides,
})

const message = (overrides: Partial<OpexMessageDto>): OpexMessageDto => ({
  id: 'm1',
  role: 'assistant',
  kind: 'message',
  text: '',
  files: [],
  parts: [],
  status: 'complete',
  error: null,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  durationMs: 2300,
  model: 'anthropic/claude-x',
  createdAt: '2026-10-19T12:00:00.000Z',
  ...overrides,
})

describe('card de ferramenta', () => {
  it('confirmação pendente mostra o resumo e envia a decisão', () => {
    const onDecide = vi.fn()
    render(<OpexToolCard part={toolPart({ confirmation: { actionId: 'a1', summary: 'Excluir o usuário ana@example.test', status: 'pending', error: null } })} onDecide={onDecide} />)
    expect(screen.getByText('Excluir o usuário ana@example.test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(onDecide.mock.calls).toEqual([
      ['a1', 'confirm'],
      ['a1', 'cancel'],
    ])
  })

  it('decidida mostra a situação sem botões; falha mostra o erro', () => {
    render(<OpexToolCard part={toolPart({ confirmation: { actionId: 'a1', summary: 'Excluir', status: 'failed', error: 'Storage fora do ar' } })} />)
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
    expect(screen.getByText('Falhou: Storage fora do ar')).toBeTruthy()
  })

  it('detalhes da entrada abrem ao clicar e a duração aparece', () => {
    render(<OpexToolCard part={toolPart()} />)
    expect(screen.getByText('1,5 s')).toBeTruthy()
    const toggle = screen.getByRole('button', { expanded: false })
    fireEvent.click(toggle)
    expect(screen.getByText('{"user":"ana@example.test"}')).toBeTruthy()
  })
})

describe('mensagens', () => {
  it('resposta ao vivo vazia mostra "Pensando…"', () => {
    render(<AssistantMessage parts={[]} streaming thinking={false} />)
    expect(screen.getByRole('status').textContent).toContain('Pensando…')
  })

  it('resposta com erro mostra a mensagem e "Tentar novamente"; o rodapé traz modelo, tokens e duração', () => {
    const onRetry = vi.fn()
    render(<AssistantMessage parts={[{ type: 'text', text: 'Parcial' }]} message={message({ status: 'error', error: 'Credencial recusada' })} onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Credencial recusada')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByText('anthropic/claude-x')).toBeTruthy()
    expect(screen.getByText('15 tokens')).toBeTruthy()
  })

  it('decisão de confirmação aparece como nota, não como balão', () => {
    render(<UserMessage message={message({ role: 'user', kind: 'confirmation', text: 'Confirmado: Excluir x' })} />)
    expect(screen.getByText('Confirmado: Excluir x')).toBeTruthy()
  })
})

const upload = (overrides: Partial<OpexUploadItem>): OpexUploadItem => ({
  localId: 'u1',
  sessionId: 's1',
  file: new File(['x'], 'erro.log'),
  name: 'erro.log',
  size: 2048,
  mediaType: 'text/plain',
  kind: 'text',
  previewUrl: null,
  status: 'done',
  progress: 100,
  error: null,
  reservationId: 'f1',
  putDone: true,
  uploaded: { id: 'f1', name: 'erro.log', mediaType: 'text/plain', size: 2048, kind: 'text', url: '/api/opex/files/f1' },
  ...overrides,
})

describe('arquivos no chat', () => {
  it('chips mostram progresso, erro com nova tentativa e remoção', () => {
    const onRetry = vi.fn()
    const onRemove = vi.fn()
    render(<OpexAttachmentChips items={[upload({ localId: 'a', status: 'uploading', progress: 40 }), upload({ localId: 'b', name: 'b.png', status: 'error', error: 'Limite excedido' }), upload({ localId: 'c', name: 'c.pdf', status: 'confirming' })]} onRetry={onRetry} onRemove={onRemove} />)
    expect(screen.getByText('Enviando… 40%')).toBeTruthy()
    expect(screen.getByText('Confirmando…')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Limite excedido')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar b.png de novo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover erro.log' }))
    expect(onRetry).toHaveBeenCalledWith('b')
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  const composer = (items: OpexUploadItem[], onSend = vi.fn(), onFiles = vi.fn()) =>
    render(<OpexComposer onSend={onSend} attachments={{ items, onFiles, onRetry: vi.fn(), onRemove: vi.fn() }} onStop={vi.fn()} running={false} sending={false} stopping={false} />)

  it('só arquivos já enviados liberam o Enviar (sem texto); durante o envio fica bloqueado', () => {
    const onSend = vi.fn()
    composer([upload({ status: 'confirming' })], onSend)
    const send = screen.getByRole('button', { name: 'Enviar mensagem' })
    expect(send.hasAttribute('disabled')).toBe(true)
    expect(send.getAttribute('title')).toBe('Aguarde o envio dos arquivos')
    cleanup()
    composer([upload({})], onSend)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    expect(onSend).toHaveBeenCalledWith('')
  })

  it('colar arquivos na caixa de texto os anexa', () => {
    const onFiles = vi.fn()
    composer([], vi.fn(), onFiles)
    const pasted = new File(['png'], 'image.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox', { name: 'Mensagem para o Agente Opex' }), { clipboardData: { files: [pasted] } })
    expect(onFiles).toHaveBeenCalledWith([pasted])
  })

  it('mensagem do usuário mostra a imagem (amplia ao clicar) e o arquivo para baixar', () => {
    render(
      <UserMessage
        message={message({
          role: 'user',
          text: 'Veja',
          files: [
            { id: 'i1', name: 'print.png', mediaType: 'image/png', size: 10, kind: 'image', url: '/api/opex/files/i1' },
            { id: 'f1', name: 'erro.log', mediaType: 'text/plain', size: 2048, kind: 'text', url: '/api/opex/files/f1' },
          ],
        })}
      />,
    )
    expect(screen.getByRole('img', { name: 'print.png' }).getAttribute('src')).toContain('/api/opex/files/i1')
    expect(screen.getByRole('link', { name: /erro\.log/ }).getAttribute('href')).toContain('/api/opex/files/f1?download=1')
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar print.png' }))
    expect(screen.getByRole('dialog').querySelector('img')?.getAttribute('alt')).toBe('print.png')
  })
})

describe('abas de sessão', () => {
  it('mostra o título de cada sessão aberta, ativa ao clicar e fecha sem excluir', () => {
    const sessions = new Map<string, OpexSessionDto>([['s1', { id: 's1', title: 'Tarefa do CRM', summary: 'Resumo', status: 'running' } as OpexSessionDto]])
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<OpexSessionTabs open={['s1']} active="draft" sessions={sessions} onActivate={onActivate} onClose={onClose} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.textContent).toContain('Tarefa do CRM')
    expect(tabs[0]!.textContent).toContain('Respondendo')
    expect(tabs[1]!.textContent).toContain('Nova sessão')
    fireEvent.click(screen.getByRole('tab', { name: /Tarefa do CRM/ }))
    expect(onActivate).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar a aba Tarefa do CRM' }))
    expect(onClose).toHaveBeenCalledWith('s1')
  })
})

describe('fila de envio (PUT assinado no S3)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <OpexUploadsProvider>{children}</OpexUploadsProvider>
  const limits = { maxPerMessage: 5, maxSizeMb: 10 }
  const fileDto = { id: 'f'.repeat(24), name: 'print.png', mediaType: 'image/png', size: 3, kind: 'image', url: '/api/opex/files/x' }

  it('reserva, envia direto ao storage com progresso real e confirma', async () => {
    net.post.mockImplementation(async (url: string) =>
      url.endsWith('/files') ? { data: { data: { id: 'f'.repeat(24), method: 'PUT', url: 'https://s3.local/put', headers: { 'Content-Type': 'image/png' }, expiresIn: 900 } } } : { data: { data: fileDto } },
    )
    let finishPut: () => void = () => {}
    net.put.mockImplementation((_url: string, _file: File, options: { onUploadProgress: (event: { loaded: number; total: number }) => void }) => {
      options.onUploadProgress({ loaded: 1, total: 2 })
      return new Promise<void>((resolve) => (finishPut = resolve))
    })
    const { result } = renderHook(() => useOpexUploads('s1'), { wrapper })
    act(() => result.current.enqueue('s1', [new File(['png'], 'print.png', { type: 'image/png' })], limits))
    await waitFor(() => expect(result.current.items[0]?.progress).toBe(50))
    expect(result.current.uploading).toBe(true)
    expect(net.post).toHaveBeenCalledWith('/opex/sessions/s1/files', { name: 'print.png', size: 3, mediaType: 'image/png' }, expect.anything())
    expect(net.put).toHaveBeenCalledWith('https://s3.local/put', expect.any(File), expect.objectContaining({ headers: { 'Content-Type': 'image/png' } }))
    await act(async () => finishPut())
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))
    expect(net.post).toHaveBeenLastCalledWith(`/opex/files/${'f'.repeat(24)}/complete`, {}, expect.anything())
    expect(result.current.ready).toHaveLength(1)
  })

  it('falha na confirmação vira erro; tentar de novo só refaz a confirmação', async () => {
    let completes = 0
    net.post.mockImplementation(async (url: string) => {
      if (url.endsWith('/files')) return { data: { data: { id: 'g'.repeat(24), method: 'PUT', url: 'https://s3.local/put', headers: {}, expiresIn: 900 } } }
      completes += 1
      if (completes === 1) throw new Error('Storage indisponível')
      return { data: { data: { ...fileDto, id: 'g'.repeat(24) } } }
    })
    net.put.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOpexUploads('s2'), { wrapper })
    act(() => result.current.enqueue('s2', [new File(['png'], 'b.png', { type: 'image/png' })], limits))
    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'))
    expect(result.current.items[0]?.error).toBe('Storage indisponível')
    net.put.mockClear()
    act(() => result.current.retry(result.current.items[0]!.localId))
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'))
    expect(net.put).not.toHaveBeenCalled()
  })
})

describe('token gerado pelo agente', () => {
  const output = JSON.stringify({ ok: true, token: 'mt_sys_SEGREDO123456789', item: { id: 't1', nome: 'Relatórios', prefixo: 'mt_sys_SEGREDO1' } }, null, 2)

  it('mostra o card com o valor e copia; nos detalhes o valor fica mascarado', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    render(<OpexToolCard part={toolPart({ name: 'create_api_token', group: 'api-tokens', label: 'Gerar token', output, confirmation: { actionId: 'a1', summary: 'Gerar o token', status: 'confirmed', error: null } })} />)
    expect(screen.getByText('Token "Relatórios"')).toBeTruthy()
    expect(screen.getByText('mt_sys_SEGREDO123456789')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar token' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('mt_sys_SEGREDO123456789'))
    expect(toast.success).toHaveBeenCalledWith('Token copiado.')
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByText((_, element) => element?.tagName === 'PRE' && element.textContent!.includes('mt_sys_SEGRE…')).length).toBe(1)
  })

  it('sem execução (pendente) não há card de token', () => {
    render(<OpexToolCard part={toolPart({ name: 'create_api_token', group: 'api-tokens', label: 'Gerar token', confirmation: { actionId: 'a1', summary: 'Gerar o token', status: 'pending', error: null } })} />)
    expect(screen.queryByRole('button', { name: 'Copiar token' })).toBeNull()
  })
})

describe('seleção de ferramentas na configuração (árvore igual à de permissões)', () => {
  let current: OpexAgentSettings | null = null
  function Harness({ disabledTools = [] as string[] }) {
    const form = useForm<OpexAgentSettings>({ defaultValues: { ...DEFAULT_OPEX_AGENT_SETTINGS, disabledTools } })
    current = form.watch() as OpexAgentSettings
    return <OpexToolsCard form={form} />
  }
  const userTools = OPEX_TOOL_CATALOG.filter((tool) => tool.group === 'users').map((tool) => tool.name)

  it('desmarcar o grupo grava todas as ferramentas dele como desligadas; marcar de novo liga', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Usuários' }))
    expect(new Set(current!.disabledTools)).toEqual(new Set(userTools))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Usuários' }))
    expect(current!.disabledTools).toEqual([])
  })

  it('desligar uma ferramenta mantém as demais; contexto é sempre ligado e travado', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Usuários'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excluir usuário' }))
    expect(current!.disabledTools).toEqual(['delete_user'])
    fireEvent.click(screen.getByText('Contexto'))
    const context = screen.getByRole('checkbox', { name: 'Visão geral' })
    expect(context.hasAttribute('disabled') || context.getAttribute('aria-disabled') === 'true' || context.getAttribute('data-disabled') !== null).toBe(true)
    expect(screen.getByText('Sempre ligada')).toBeTruthy()
  })

  it('mostra risco e permissões exigidas de cada ferramenta e busca por nome', () => {
    render(<Harness />)
    fireEvent.change(screen.getByPlaceholderText('Buscar ferramenta...'), { target: { value: 'token' } })
    expect(screen.getByText('create_api_token')).toBeTruthy()
    expect(screen.getAllByText('integrations.internal_api.tokens').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sempre confirma').length).toBeGreaterThan(0)
    expect(screen.queryByText('list_users')).toBeNull()
  })
})
