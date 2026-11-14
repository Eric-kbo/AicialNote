// Takes UI screenshots of the demo vault. Usage:
//   pnpm dev   (in another terminal)
//   node scripts/screenshots.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const out = process.argv[2] ?? '.shots'
const base = process.env.AICIALNOTE_URL ?? 'http://localhost:5173'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const errors = []

async function session(name, { dark = false, locale = 'zh-CN' } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 860 },
    deviceScaleFactor: 1,
    locale,
    colorScheme: dark ? 'dark' : 'light',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
  return { context, page }
}

const shot = (page, file) => page.screenshot({ path: join(out, file) })

/** Opens the export or import dialog from the account menu. */
async function openDataDialog(page, which) {
  await page.getByRole('button', { name: /^(演示数据|Demo data)$/ }).click()
  await page
    .getByRole('menuitem', { name: which === 'export' ? /导出数据|Export data/ : /导入数据|Import data/ })
    .click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(250)
}

/** Feeds the import dialog a backup taken from the demo drive, so the summary shows. */
async function importDemoBackup(page) {
  const text = await page.evaluate(async () => {
    const s = window.__aicialnoteDemoStorage
    const items = []
    for (const p of s
      .paths()
      .filter((p) => p.startsWith('items/'))
      .slice(0, 3)) {
      const item = JSON.parse((await s.read(p)).text)
      items.push({ ...item, name: `${item.name} (2)`, updatedAt: new Date(Date.now() + 60_000).toISOString() })
    }
    return JSON.stringify({ format: 'aicialnote.backup', formatVersion: 1, exportedAt: '', items, notes: [] })
  })
  await page.locator('[data-import-input]').setInputFiles({
    name: 'AicialNote-backup-2026-11-11.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await page.locator('[data-import-summary]').waitFor()
  await page.waitForTimeout(200)
}

/** Opens a section of the demo notebooks and waits for its editor. */
async function openSection(page, name) {
  await page.locator('[data-note-row="section"]', { hasText: name }).click()
  await page.locator('[data-page-editor]').waitFor()
  await page.waitForTimeout(400)
}

{
  const { context, page } = await session('light')
  await page.goto(base)
  await page.getByRole('button', { name: /演示数据|demo data/i }).waitFor()
  await shot(page, '01-connect.png')

  await page.getByRole('button', { name: /演示数据|demo data/i }).click()
  await page.getByRole('row').first().waitFor()
  await page.waitForTimeout(600)
  await shot(page, '02-list.png')

  await page
    .getByRole('button', { name: /状态|Status/ })
    .first()
    .click()
  await page.waitForTimeout(200)
  await shot(page, '03-filter-menu.png')
  await page.keyboard.press('Escape')

  await page.getByRole('row').getByText('Linda Russo', { exact: true }).click()
  await page.waitForTimeout(500)
  await shot(page, '04-detail.png')

  await page
    .getByRole('button', { name: /^(未填写|Empty)$/ })
    .first()
    .click()
  await page.waitForTimeout(200)
  await shot(page, '05-detail-editing.png')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page
    .getByRole('button', { name: /粘贴导入|Paste/ })
    .first()
    .click()
  await page
    .locator('textarea')
    .fill(
      '账号 new.teammate.demo@gmail.com 密码 Hx8#kq2Lm 辅助邮箱 nt.recovery@outlook.com 2FA JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP 温馨提示 仅限测试环境使用，每个地区IP约7天轮换一次',
    )
  await page.waitForTimeout(300)
  await shot(page, '06-paste-single.png')

  await page
    .locator('textarea')
    .fill(
      'a1.batch@gmail.com----Pw1!aa----a1.rec@outlook.com\na2.batch@gmail.com----Pw2!bb----a2.rec@outlook.com\na3.batch@gmail.com----Pw3!cc----a3.rec@outlook.com\n198.51.100.9:8001:pxuser:pxpass',
    )
  await page.waitForTimeout(300)
  await shot(page, '07-paste-bulk.png')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+k')
  await page.keyboard.type('nora')
  await page.waitForTimeout(200)
  await shot(page, '08-palette.png')
  await page.keyboard.press('Escape')

  await openSection(page, '团队与网络')
  await shot(page, '12-notes-page.png')
  await page.locator('[data-page-editor]').getByText('已开启 2FA 并保存密钥', { exact: true }).click()
  await page.waitForTimeout(300) // ProseMirror syncs the selection shortly after focus
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.locator('[data-slash-menu]').waitFor()
  await page.waitForTimeout(200)
  await shot(page, '13-notes-slash.png')
  await page.keyboard.press('Escape')
  await page.locator('[data-note-row="section"]', { hasText: '订阅与续费' }).click({ button: 'right' })
  await page.waitForTimeout(200)
  await shot(page, '14-notes-menu.png')
  await page.keyboard.press('Escape')
  await openSection(page, '订阅与续费')
  await page.locator('[data-page-editor] td').first().click()
  await page.waitForTimeout(200)
  await shot(page, '15-notes-table.png')
  await openDataDialog(page, 'export')
  await shot(page, '22-export.png')
  await page.keyboard.press('Escape')
  await openDataDialog(page, 'import')
  await shot(page, '23-import.png')
  await page.keyboard.press('Escape')
  await context.close()
}

{
  const { context, page } = await session('dark', { dark: true })
  await page.goto(base)
  await page.getByRole('button', { name: /演示数据|demo data/i }).waitFor()
  await shot(page, '24-connect-dark.png')
  await page.getByRole('button', { name: /演示数据|demo data/i }).click()
  await page.getByRole('row').first().waitFor()
  await page.waitForTimeout(600)
  await shot(page, '09-list-dark.png')
  await page.getByRole('row').getByText('Linda Russo', { exact: true }).click()
  await page.waitForTimeout(500)
  await shot(page, '10-detail-dark.png')
  await openSection(page, '团队与网络')
  await shot(page, '16-notes-dark.png')
  await openSection(page, '订阅与续费')
  await shot(page, '17-notes-table-dark.png')
  await openSection(page, '登录账号')
  await page.locator('[data-row-kind="accountList"]').click()
  await page.waitForTimeout(400)
  await shot(page, '19-account-list-dark.png')
  await page.locator('[data-row-kind="account"]').first().click()
  await page.waitForTimeout(400)
  await shot(page, '20-account-in-notebook-dark.png')
  await openDataDialog(page, 'export')
  await shot(page, '25-export-dark.png')
  await page.keyboard.press('Escape')
  await openDataDialog(page, 'import')
  await importDemoBackup(page)
  await shot(page, '26-import-summary-dark.png')
  await page.keyboard.press('Escape')
  await context.close()
}

{
  const { context, page } = await session('en', { locale: 'en-US' })
  await page.goto(base)
  await page.evaluate(() => localStorage.setItem('aicialnote.locale', 'en'))
  await page.goto(base)
  await shot(page, '11-connect-en.png')
  await page.getByRole('button', { name: /demo data/i }).click()
  await page.getByRole('row').first().waitFor()
  await openSection(page, 'Team & network')
  await shot(page, '18-notes-en.png')
  await openSection(page, 'Logins')
  await page.locator('[data-row-kind="accountList"]').click()
  await page.waitForTimeout(400)
  await shot(page, '21-account-list-en.png')
  await openDataDialog(page, 'import')
  await importDemoBackup(page)
  await shot(page, '27-import-summary-en.png')
  await page.keyboard.press('Escape')
  await openDataDialog(page, 'export')
  await shot(page, '28-export-en.png')
  await page.keyboard.press('Escape')
  await context.close()
}

await browser.close()
if (errors.length) {
  console.log('Console errors:')
  for (const e of errors) console.log('  ', e)
} else console.log('No console errors.')
