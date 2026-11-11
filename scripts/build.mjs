// Builds the web app and embeds it into a single Go binary: server/bin/aicialnote
//
//   node scripts/build.mjs           binary for this machine
//   node scripts/build.mjs --linux   static linux/amd64 binary: server/bin/aicialnote-linux-amd64
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, cwd = root, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })

run('pnpm --filter @aicialnote/web build')

const target = join(root, 'server/internal/webui/dist')
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(join(root, 'web/dist'), target, { recursive: true })
writeFileSync(join(target, '.gitkeep'), '')

const linux = process.argv.includes('--linux')
const exe = linux ? 'aicialnote-linux-amd64' : process.platform === 'win32' ? 'aicialnote.exe' : 'aicialnote'
const env = linux ? { GOOS: 'linux', GOARCH: 'amd64', CGO_ENABLED: '0' } : {}
run(`go build -trimpath -ldflags="-s -w" -o bin/${exe} ./cmd/aicialnote`, join(root, 'server'), env)
console.log(`\nBuilt server/bin/${exe}`)
