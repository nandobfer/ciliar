import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(name, 'utf8')

describe('infraestrutura Docker copiada', () => {
    it('mantém os quatro estágios, dependências travadas e runner standalone sem root', () => {
        const dockerfile = read('Dockerfile')
        for (const stage of ['base', 'deps', 'dev', 'builder', 'runner']) expect(dockerfile).toMatch(new RegExp(`FROM .+ AS ${stage}\\b`))
        expect(dockerfile).toContain('pnpm install --frozen-lockfile --ignore-scripts')
        expect(dockerfile).toContain('/app/.next/standalone')
        expect(dockerfile).toContain('USER nextjs')
        expect(dockerfile).toContain('CMD ["node", "server.js"]')
        expect(dockerfile).not.toContain('INTEGRATIONS_ENCRYPTION_KEY')
        expect(read('next.config.ts')).toContain('output: "standalone"')
    })

    it('exclui segredos, dados locais, caches e worktrees do contexto de build', () => {
        const excluded = read('.dockerignore').split(/\r?\n/)
        for (const name of ['.env', '.env*', 'node_modules', '.next', '.git', '.cortexkit', 'worktrees']) expect(excluded).toContain(name)
    })

    it('não reaproveita nomes ou banco do Opex nas configurações executáveis', () => {
        expect(read('docker-compose.yml')).toContain('name: "ciliar-')
        expect(read('docker-compose.yml')).not.toMatch(/27017\/opex|name: "opex-/)
        expect(read('docker-compose.deploy.yml')).toContain('CILIAR_IMAGE')
        expect(read('scripts/deploy-production.ts')).not.toContain('OPEX_IMAGE')
    })
})

const hasCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasCompose)('validação real do Docker Compose, sem iniciar containers', () => {
    const dir = mkdtempSync(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'ciliar-docker-'))
    for (const file of ['Dockerfile', 'docker-compose.yml', 'docker-compose.deploy.yml']) copyFileSync(file, join(dir, file))
    const uri = 'mongodb://ciliar_app:senha-ficticia@mongodb:27017/ciliar?authSource=ciliar&directConnection=true'
    const env = { PATH: process.env.PATH, HOME: process.env.HOME }
    writeFileSync(join(dir, '.env'), `PORT=3101\nMONGODB_URI=mongodb://127.0.0.1:27017/ciliar\nDOCKER_MONGODB_URI=${uri}\n`)
    afterAll(() => rmSync(dir, { recursive: true, force: true }))

    function config(deploy = false) {
        const files = ['-f', 'docker-compose.yml', ...(deploy ? ['-f', 'docker-compose.deploy.yml'] : [])]
        return JSON.parse(execFileSync('docker', ['compose', ...files, '--profile', 'dev', 'config', '--format', 'json'], {
            cwd: dir,
            env: { ...env, ...(deploy ? { CILIAR_IMAGE: 'ciliar:teste' } : {}) },
            encoding: 'utf8',
            timeout: 10000,
        }))
    }

    it('isola o projeto, usa a URI interna e preserva redes e limites do Opex', () => {
        const result = config()
        expect(result.name).toBe('ciliar-3101')
        for (const service of ['app', 'app-dev']) {
            expect(result.services[service].environment.MONGODB_URI).toBe(uri)
            expect(result.services[service].ports[0]).toMatchObject({ target: 3101, published: '3101' })
            expect(Object.keys(result.services[service].networks)).toEqual(['mongodb-network', 'soketi-network'])
        }
        expect(result.services.app.deploy.resources.limits).toMatchObject({ cpus: 2, memory: '4294967296' })
        expect(result.networks['mongodb-network'].external).toBe(true)
        expect(result.networks['soketi-network'].external).toBe(true)
    })

    it('preserva o perfil dev, hot reload e reconstrução ao mudar dependências', () => {
        const dev = config().services['app-dev']
        expect(dev.profiles).toEqual(['dev'])
        expect(dev.build.target).toBe('dev')
        expect(dev.command).toEqual(['pnpm', 'exec', 'next', 'dev', '--turbo', '--hostname', '0.0.0.0', '--port', '3101'])
        expect(dev.develop.watch).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'sync', target: '/app/src' }),
            expect.objectContaining({ action: 'rebuild', path: join(dir, 'pnpm-lock.yaml') }),
        ]))
    })

    it('aplica a imagem de deploy sem pull e exige a variável exclusiva do Ciliar', () => {
        expect(config(true).services.app).toMatchObject({ image: 'ciliar:teste', pull_policy: 'never' })
        const result = spawnSync('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.deploy.yml', 'config', '--quiet'], { cwd: dir, env, encoding: 'utf8' })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('CILIAR_IMAGE')
    })

    it('recusa subir sem uma URI Docker explícita em vez de apontar para o banco errado', () => {
        const result = spawnSync('docker', ['compose', 'config', '--quiet'], {
            cwd: dir, env: { ...env, DOCKER_MONGODB_URI: '' }, encoding: 'utf8',
        })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('DOCKER_MONGODB_URI')
    })
})
