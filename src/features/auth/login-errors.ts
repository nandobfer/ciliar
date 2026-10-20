/** Motivos de recusa do login (módulo puro: servidor redireciona, a tela exibe). */
export const LOGIN_ERROR_MESSAGES = {
    "nao-verificado": "O Google não confirmou este e-mail como verificado. Use uma conta com e-mail verificado.",
    inativo: "Sua conta está inativa. Fale com um administrador.",
    "cadastro-indisponivel": "O cadastro público está indisponível no momento. Peça um convite a um administrador.",
    "conta-vinculada": "Este e-mail já está vinculado a outra conta Google. Entre com a conta Google original.",
    falha: "Não foi possível entrar com o Google. Tente novamente.",
} as const

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES

export const loginErrorPath = (code: LoginErrorCode) => `/login?erro=${code}`

/** Mensagem do `?erro=` (nosso) ou do `?error=` (protocolo Auth.js); desconhecido vira a genérica. */
export function loginErrorMessage(erro?: string, error?: string): string | undefined {
    if (erro) return erro in LOGIN_ERROR_MESSAGES ? LOGIN_ERROR_MESSAGES[erro as LoginErrorCode] : LOGIN_ERROR_MESSAGES.falha
    if (!error) return undefined
    if (error === "Configuration") return "Login com Google indisponível: a configuração do servidor está incompleta."
    return LOGIN_ERROR_MESSAGES.falha
}
