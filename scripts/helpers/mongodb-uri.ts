export class ScriptMongoConfigError extends Error {}

/** Somente um hostname Docker explicitamente configurado é traduzido; não modifica o .env. */
export function resolveScriptMongoUri(uri: string | undefined, dockerHostname = "mongodb", publishedPort?: string, inContainer = false): string {
    if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new ScriptMongoConfigError("Configure MONGODB_URI no .env")
    if (inContainer) return uri
    const authority = /^(mongodb:\/\/)([^/?#]*)(.*)$/.exec(uri)
    if (!authority) return uri
    const [, scheme, value, suffix] = authority
    const separator = value!.lastIndexOf("@")
    const credentials = value!.slice(0, separator + 1)
    const hosts = value!.slice(separator + 1)
    if (hosts.includes(",")) return uri
    const [hostname, port] = hosts.split(":")
    if (hostname!.toLowerCase() !== dockerHostname.toLowerCase()) return uri
    if (publishedPort && !/^\d{1,5}$/.test(publishedPort)) throw new ScriptMongoConfigError("SCRIPT_MONGODB_PORT inválida")
    return `${scheme}${credentials}127.0.0.1${publishedPort || port ? `:${publishedPort || port}` : ""}${suffix}`
}
