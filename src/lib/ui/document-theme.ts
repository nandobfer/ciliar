/**
 * Modo do documento: o Ciliar é claro por padrão (sem classe no `<html>`); o modo escuro põe `.dark`
 * no `<html>` (vale também para diálogos, popovers e toasts do `<body>`). Devolve a limpeza, que
 * restaura o estado anterior.
 */
export function applyDocumentMode(mode: "dark" | "light"): () => void {
    const html = document.documentElement
    const hadDark = html.classList.contains("dark")
    const previousScheme = html.style.colorScheme
    html.classList.toggle("dark", mode === "dark")
    html.style.colorScheme = mode
    return () => {
        html.classList.toggle("dark", hadDark)
        html.style.colorScheme = previousScheme
    }
}
