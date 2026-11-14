// Prints how complete each translation in web/src/i18n/locales/ is and which keys it is missing.
// Usage: pnpm i18n:report
import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'pnpm',
  ['--filter', '@aicialnote/web', 'exec', 'vitest', 'run', 'src/i18n', '--silent=false'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, I18N_REPORT: '1' },
  },
)
process.exit(result.status ?? 1)
