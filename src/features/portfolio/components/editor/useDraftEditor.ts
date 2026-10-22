"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiErrorMessage } from "@/lib/api"
import type { BlockProblem, PortfolioBlock } from "../../blocks"
import { pushHistory, redoHistory, startHistory, undoHistory, type EditorHistory } from "../../editor-history"
import { portfolioKey, savePortfolioDraft } from "../../hooks/usePortfolio"
import type { PortfolioDto } from "../../types"

/**
 * Estado do editor do portfólio (M5): os blocos com Desfazer/Refazer e o salvamento automático do
 * rascunho 1 s depois da última alteração. Se o rascunho mudar em outro lugar (outra aba, o Agente
 * Opex), o servidor recusa a versão e o editor pede para recarregar.
 */

export const AUTOSAVE_MS = 1000

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict"

const errorCode = (error: unknown) => (error as { response?: { data?: { error?: { code?: string } } } } | null)?.response?.data?.error?.code

export function useDraftEditor(portfolio: PortfolioDto) {
    const queryClient = useQueryClient()
    const businessId = portfolio.businessId
    const [history, setHistory] = useState<EditorHistory<PortfolioBlock[]>>(() => startHistory(portfolio.draft.blocks))
    const [status, setStatus] = useState<SaveStatus>("saved")
    const [error, setError] = useState<string | null>(null)
    const [savedAt, setSavedAt] = useState<string | null>(portfolio.draft.updatedAt)
    const [problems, setProblems] = useState<BlockProblem[]>(portfolio.problems)
    const [hasChanges, setHasChanges] = useState(portfolio.hasChanges)
    const [draftVersion, setDraftVersion] = useState(portfolio.draft.version)
    const [savedBlocks, setSavedBlocks] = useState(portfolio.draft.blocks)
    const version = useRef(portfolio.draft.version)
    const saved = useRef(portfolio.draft.blocks)
    const latest = useRef(history.present)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const inFlight = useRef(false)
    const statusRef = useRef(status)
    useEffect(() => {
        statusRef.current = status
        latest.current = history.present
        version.current = draftVersion
        saved.current = savedBlocks
    })

    // Versão nova do servidor (ações do editor, outra aba, o agente): sem alterações locais, adota.
    const [seen, setSeen] = useState(portfolio)
    if (seen !== portfolio) {
        setSeen(portfolio)
        if (portfolio.draft.version > draftVersion && status === "saved") {
            setDraftVersion(portfolio.draft.version)
            setSavedBlocks(portfolio.draft.blocks)
            setHistory(startHistory(portfolio.draft.blocks))
            setProblems(portfolio.problems)
            setHasChanges(portfolio.hasChanges)
            setSavedAt(portfolio.draft.updatedAt)
        } else if (portfolio.draft.version === draftVersion) {
            setHasChanges(portfolio.hasChanges)
        }
    }

    const save = useCallback(async () => {
        if (inFlight.current || statusRef.current === "conflict") return
        const blocks = latest.current
        if (blocks === saved.current) {
            setStatus("saved")
            return
        }
        inFlight.current = true
        setStatus("saving")
        try {
            const result = await savePortfolioDraft(businessId, blocks, version.current)
            version.current = result.draftVersion
            saved.current = blocks
            setDraftVersion(result.draftVersion)
            setSavedBlocks(blocks)
            setSavedAt(result.updatedAt)
            setProblems(result.problems)
            setHasChanges(result.hasChanges)
            setError(null)
            // Mantém o cache coerente sem reler tudo (a invalidação em tempo real relê depois).
            queryClient.setQueryData<PortfolioDto>(portfolioKey(businessId), (current) => (current ? { ...current, draft: { blocks, version: result.draftVersion, updatedAt: result.updatedAt }, problems: result.problems, hasChanges: result.hasChanges } : current))
            setStatus(latest.current === blocks ? "saved" : "pending")
        } catch (caught) {
            if (errorCode(caught) === "PORTFOLIO_DRAFT_CONFLICT") setStatus("conflict")
            else {
                setStatus("error")
                setError(apiErrorMessage(caught, "Não foi possível salvar o rascunho"))
            }
        } finally {
            inFlight.current = false
        }
    }, [businessId, queryClient])

    // Agenda o salvamento depois da última alteração (e de novo se mudou durante o envio).
    useEffect(() => {
        if (status !== "pending") return
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [status, history.present, save])

    // Sair com alterações ainda não salvas pede confirmação.
    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (statusRef.current === "pending" || statusRef.current === "saving" || statusRef.current === "error") event.preventDefault()
        }
        window.addEventListener("beforeunload", onBeforeUnload)
        return () => window.removeEventListener("beforeunload", onBeforeUnload)
    }, [])

    // Ao desmontar (trocar de página no app), envia o que faltar.
    useEffect(
        () => () => {
            if (latest.current !== saved.current && statusRef.current !== "conflict") void savePortfolioDraft(businessId, latest.current, version.current).catch(() => undefined)
        },
        [businessId],
    )

    const change = useCallback((next: PortfolioBlock[], key?: string) => {
        setHistory((current) => pushHistory(current, next, { key }))
        setStatus((current) => (current === "conflict" ? current : "pending"))
    }, [])
    const undo = useCallback(() => {
        setHistory((current) => undoHistory(current))
        setStatus((current) => (current === "conflict" ? current : "pending"))
    }, [])
    const redo = useCallback(() => {
        setHistory((current) => redoHistory(current))
        setStatus((current) => (current === "conflict" ? current : "pending"))
    }, [])
    /** Relê o servidor e descarta o estado local (depois de um conflito). */
    const reload = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: portfolioKey(businessId) })
        const fresh = queryClient.getQueryData<PortfolioDto>(portfolioKey(businessId))
        if (!fresh) return
        version.current = fresh.draft.version
        saved.current = fresh.draft.blocks
        setDraftVersion(fresh.draft.version)
        setSavedBlocks(fresh.draft.blocks)
        setHistory(startHistory(fresh.draft.blocks))
        setProblems(fresh.problems)
        setHasChanges(fresh.hasChanges)
        setStatus("saved")
        setError(null)
    }, [businessId, queryClient])
    /** Envia já (antes de publicar). Devolve a versão do rascunho salva. */
    const flush = useCallback(async (): Promise<number | null> => {
        if (timer.current) clearTimeout(timer.current)
        while (inFlight.current) await new Promise((resolve) => setTimeout(resolve, 50))
        if (latest.current !== saved.current) await save()
        return latest.current === saved.current && statusRef.current !== "conflict" && statusRef.current !== "error" ? version.current : null
    }, [save])

    return {
        blocks: history.present,
        change,
        undo,
        redo,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        status,
        error,
        savedAt,
        problems,
        hasChanges: hasChanges || history.present !== savedBlocks,
        flush,
        reload,
        retry: save,
    }
}
