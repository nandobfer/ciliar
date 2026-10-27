/** Motivos de recusa do login (módulo puro: servidor redireciona, a tela exibe). */
export const LOGIN_ERROR_MESSAGES = {
    "nao-verificado": "O Google não confirmou este e-mail como verificado. Use uma conta com e-mail verificado.",
    inativo: "Sua conta está inativa. Fale com um administrador.",
    "cadastro-indisponivel": "O cadastro público está indisponível no momento. Peça um convite a um administrador.",
    "conta-vinculada": "Este e-mail já está vinculado a outra conta Google. Entre com a conta Google original.",
    "metodo-indisponivel": "Este método de login não está disponível neste endereço de acesso.",
    "muitas-tentativas": "Muitas tentativas. Aguarde e tente novamente.",
    credenciais: "E-mail ou senha incorretos.",
    falha: "Não foi possível entrar com o Google. Tente novamente.",
} as const

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES

export const loginErrorPath = (code: LoginErrorCode) => `/login?erro=${code}`

/** Mensagem do `?erro=` (nosso) ou do `?error=` (protocolo Auth.js); desconhecido vira a genérica. */
export function loginErrorMessage(erro?: string, error?: string): string | undefined {
    if (erro) return erro in LOGIN_ERROR_MESSAGES ? LOGIN_ERROR_MESSAGES[erro as LoginErrorCode] : LOGIN_ERROR_MESSAGES.falha
    if (!error) return undefined
    if (error === "Configuration") return "Login indisponível: a configuração do servidor está incompleta."
    if (error === "CredentialsSignin") return LOGIN_ERROR_MESSAGES.credenciais
    return LOGIN_ERROR_MESSAGES.falha
}

/** Mensagem do erro devolvido pelo `signIn("credentials", { redirect: false })`. */
export function credentialsErrorMessage(error?: string): string {
    if (error === "MetodoIndisponivel") return LOGIN_ERROR_MESSAGES["metodo-indisponivel"]
    if (error === "RateLimited") return LOGIN_ERROR_MESSAGES["muitas-tentativas"]
    if (error === "CredentialsSignin") return LOGIN_ERROR_MESSAGES.credenciais
    return "Não foi possível entrar. Tente novamente."
}
