// End-to-end smoke test against the dev server in demo mode.
//   pnpm dev   (in another terminal)
//   node scripts/smoke.mjs
import assert from 'node:assert/strict'
import { readFile as readLocalFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.AICIALNOTE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ locale: 'zh-CN', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('502') && errors.push(m.text()))

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `)
  await fn()
  console.log('ok')
}
const drive = () => page.evaluate(() => window.__aicialnoteDemoStorage.paths())
const readFile = (p) => page.evaluate((p) => window.__aicialnoteDemoStorage.read(p).then((r) => r?.text ?? null), p)
const waitSynced = () => page.getByRole('button', { name: '已同步' }).waitFor({ timeout: 10_000 })
const openAccountMenuItem = async (name) => {
  await page.getByRole('button', { name: '演示数据', exact: true }).click()
  await page.getByRole('menuitem', { name }).click()
}
const importFile = (name, text) =>
  page.locator('[data-import-input]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })

try {
  await page.goto(base)
  await step('the start page links to the source code on GitHub', async () => {
    const link = page.getByRole('banner').getByRole('link', { name: 'GitHub 源代码' })
    await link.waitFor()
    assert.match(await link.getAttribute('href'), /^https:\/\/github\.com\//)
  })
  await page.getByRole('button', { name: /演示数据/ }).click()
  await page.getByRole('row').first().waitFor()
  await waitSynced()

  await step('a default status label written by an older version is renamed on the drive', async () => {
    const before = JSON.parse(await readFile('vault.json'))
    const relabel = (label) => before.statuses.map((s) => (s.id === 'warming' ? { ...s, label } : s))
    // As if another device running an older version had saved vault.json.
    const old = JSON.stringify({ ...before, statuses: relabel('养号中'), keptKey: 'x' }, null, 2)
    await page.evaluate((text) => window.__aicialnoteDemoStorage.write('vault.json', text), old)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const deadline = Date.now() + 10_000
    while ((await readFile('vault.json')).includes('养号中') && Date.now() < deadline) await page.waitForTimeout(100)
    const after = JSON.parse(await readFile('vault.json'))
    assert.deepEqual(after.statuses, relabel('准备中'))
    assert.equal(after.keptKey, 'x')
    assert.equal(after.nextSeq, before.nextSeq)
    await waitSynced()
  })

  await step('smart paste creates an ID and opens it', async () => {
    await page.getByRole('button', { name: '粘贴导入' }).first().click()
    await page
      .locator('textarea')
      .fill('账号 smoke.test@gmail.com 密码 Sm0ke!pw 辅助邮箱 smoke.rec@outlook.com 温馨提示 仅限测试使用')
    await page.keyboard.press('Control+Enter')
    await page.waitForURL(/\/i\//)
    await page.getByText('smoke.test@gmail.com').waitFor()
    assert.equal(await page.locator('input[placeholder="未命名"]').inputValue(), 'smoke.test')
    assert.equal(await page.locator('textarea').last().inputValue(), '温馨提示 仅限测试使用')
  })

  const id = page.url().split('/i/')[1]

  await step('the item, its readable copy and the CSV reach the drive', async () => {
    await waitSynced()
    await page.waitForTimeout(300)
    const paths = await drive()
    assert.ok(paths.includes(`items/${id}.json`), 'item json')
    assert.ok(
      paths.some((p) => p.startsWith('readable/ID-0013 smoke.test')),
      'readable md',
    )
    const csv = await readFile('readable/全部账号.csv')
    assert.ok(csv.includes('smoke.test@gmail.com'), 'csv row')
    const json = JSON.parse(await readFile(`items/${id}.json`))
    assert.equal(json.format, 'aicialnote.item')
    assert.equal(json.cards[0].fields.find((f) => f.role === 'password').value, 'Sm0ke!pw')
  })

  const fieldLabels = async () => JSON.parse(await readFile(`items/${id}.json`)).cards[0].fields.map((f) => f.label)
  const waitLabels = async (want) => {
    const deadline = Date.now() + 10_000
    let got = await fieldLabels()
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() < deadline) {
      await page.waitForTimeout(150)
      got = await fieldLabels()
    }
    assert.deepEqual(got, want)
  }

  await step('a pasted card has no empty rows for values the paste did not have', async () => {
    assert.equal(await page.getByRole('button', { name: '未填写' }).count(), 0)
    await waitLabels(['邮箱', '密码', '辅助邮箱'])
  })

  await step('a new field: name, Enter, value, Enter saves and writes history', async () => {
    await page.getByRole('button', { name: '添加字段' }).last().click()
    await page.locator('input:focus').waitFor()
    await page.keyboard.type('手机号')
    await page.keyboard.press('Enter')
    await page.keyboard.type('+1 202 555 0147')
    await page.keyboard.press('Enter')
    await page.getByText('+1 202 555 0147').waitFor()
    assert.equal(await page.locator('input:focus').count(), 0, 'Enter on the last empty field ends editing')
    await page.waitForTimeout(900)
    await waitSynced()
    const json = JSON.parse(await readFile(`items/${id}.json`))
    assert.equal(json.cards[0].fields.find((f) => f.label === '手机号').value, '+1 202 555 0147')
    const history = (await drive()).filter((p) => p.startsWith(`history/${id}/`))
    assert.ok(history.length >= 1, 'previous version kept in history/')
  })

  await step('fields move up and down by menu, Alt+arrow and drag', async () => {
    const row = (label) => page.locator('[data-field-row]').filter({ hasText: label })
    await row('手机号').hover()
    await row('手机号').getByRole('button', { name: '更多' }).click()
    await page.getByRole('menuitem', { name: '上移' }).click()
    await waitLabels(['邮箱', '密码', '手机号', '辅助邮箱'])
    // Alt+↓ on a focused row moves it back down.
    await row('手机号').getByRole('button', { name: '编辑' }).focus()
    await page.keyboard.press('Alt+ArrowDown')
    await waitLabels(['邮箱', '密码', '辅助邮箱', '手机号'])
    // Drag by the handle onto the top half of the first row.
    await row('手机号').hover()
    const target = row('邮箱').first()
    const box = await target.boundingBox()
    await row('手机号')
      .locator('[data-field-handle]')
      .dragTo(target, { targetPosition: { x: box.width / 2, y: 4 } })
    await waitLabels(['手机号', '邮箱', '密码', '辅助邮箱'])
    await waitSynced()
  })

  await step('clicking a value copies it', async () => {
    await page.getByText('smoke.rec@outlook.com').click()
    await page.getByText('已复制').first().waitFor()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'smoke.rec@outlook.com')
  })

  await step('clicking a password copies the real value', async () => {
    await page.getByRole('button', { name: '••••••••••' }).first().click()
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Sm0ke!pw')
  })

  await step('search finds it from the list', async () => {
    await page.keyboard.press('Escape')
    await page.waitForURL(`${base}/`)
    await page.getByPlaceholder(/搜索 ID/).fill('smoke rec')
    await page.waitForTimeout(150)
    assert.equal(await page.getByRole('row').count(), 1)
    await page.getByPlaceholder(/搜索 ID/).fill('')
  })

  await step('delete goes to trash/, undo brings it back', async () => {
    await page.getByRole('row').filter({ hasText: 'smoke.test' }).click()
    await page.getByRole('button', { name: '更多' }).first().click()
    await page.getByRole('menuitem', { name: '删除此 ID' }).click()
    await page.waitForURL(`${base}/`)
    await page.getByRole('button', { name: '撤销' }).click()
    await page.getByRole('row').filter({ hasText: 'smoke.test' }).waitFor()

    await page.getByRole('row').filter({ hasText: 'smoke.test' }).click()
    await page.getByRole('button', { name: '更多' }).first().click()
    await page.getByRole('menuitem', { name: '删除此 ID' }).click()
    await page.waitForURL(`${base}/`)
    await page.waitForTimeout(7000)
    await waitSynced()
    const paths = await drive()
    assert.ok(!paths.includes(`items/${id}.json`), 'item file removed')
    assert.ok(paths.includes(`trash/${id}.json`), 'copy kept in trash/')
    assert.equal(await page.getByRole('row').filter({ hasText: 'smoke.test' }).count(), 0)
  })

  await step('importing the copy from trash/ brings the account back', async () => {
    await openAccountMenuItem('导入数据…')
    await importFile(`${id}.json`, await readFile(`trash/${id}.json`))
    const summary = page.locator('[data-import-summary]')
    await summary.waitFor()
    assert.match(await summary.textContent(), /新增账号\s*1更新账号\s*0/)
    await page.locator('[data-import-run]').click()
    await page.getByText('已导入 1 项').waitFor()
    await page.getByRole('row').filter({ hasText: 'smoke.test' }).waitFor()
    await waitSynced()
    const json = JSON.parse(await readFile(`items/${id}.json`))
    assert.equal(json.deletedAt, undefined, 'restored item is live again')
  })

  await step('a full backup holds everything, and importing it again changes nothing', async () => {
    await openAccountMenuItem('导出数据…')
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export-run]').click()])
    assert.match(download.suggestedFilename(), /^AicialNote-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const text = await readLocalFile(await download.path(), 'utf8')
    const backup = JSON.parse(text)
    assert.equal(backup.format, 'aicialnote.backup')
    assert.ok(backup.items.some((i) => i.id === id))
    assert.ok(backup.notes.length > 0, 'notes included')

    await openAccountMenuItem('导入数据…')
    await importFile(download.suggestedFilename(), text)
    await page.getByText('没有需要导入的内容').waitFor()
    assert.ok(await page.locator('[data-import-run]').isDisabled())
    await page.keyboard.press('Escape')
  })

  await step('bulk paste creates several IDs', async () => {
    const before = await page.getByRole('row').count()
    await page.getByRole('button', { name: '粘贴导入' }).first().click()
    await page.locator('textarea').fill('b1@gmail.com----p1\nb2@gmail.com----p2\nb3@gmail.com----p3')
    await page.getByRole('button', { name: /创建 3 个/ }).click()
    await page.getByText('已创建 3 个 ID').waitFor()
    assert.equal(await page.getByRole('row').count(), before + 3)
  })

  await step('a proxy card copies as one line, in the format picked', async () => {
    await page.getByRole('row').getByText('Linda Russo', { exact: true }).click()
    await page.locator('[data-proxy-copy]').click()
    await page.locator('[data-proxy-copied]').waitFor()
    const uri = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(uri, /^socks5:\/\/pxlinda:[^@]+@198\.51\.100\.40:8000$/, uri)
    await page.locator('[data-proxy-copied]').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '选择格式并复制' }).click()
    await page.getByRole('menuitem', { name: /IP:端口:用户名:密码/ }).click()
    const colon = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(colon, /^198\.51\.100\.40:8000:pxlinda:\S+$/, colon)
    await page.keyboard.press('Escape')
    await page.waitForURL(`${base}/`)
  })

  await step('a blank ID offers every card type, and a bank card reaches the drive', async () => {
    // The list toolbar's button reads "新建" plus its shortcut; a bare /^新建/ also matches "新建笔记本".
    await page.getByRole('button', { name: /^新建\s*N$/ }).click()
    const grid = page.locator('[data-card-templates]')
    await grid.waitFor()
    const names = (await grid.getByRole('button').allTextContents()).map((s) => s.trim())
    for (const name of ['OpenAI', 'Claude', '银行卡', '收货地址', '服务器', 'Wi-Fi', '证件', '自定义']) {
      assert.ok(names.includes(name), `${name} missing from ${names.join(', ')}`)
    }
    await grid.getByRole('button', { name: '银行卡' }).click()
    const id = new URL(page.url()).pathname.split('/').pop()
    const deadline = Date.now() + 15_000
    let card
    while (!card && Date.now() < deadline) {
      const text = await readFile(`items/${id}.json`)
      card = text && JSON.parse(text).cards.find((c) => c.template === 'bank')
      if (!card) await page.waitForTimeout(200)
    }
    assert.ok(card, 'bank card not written')
    assert.deepEqual(
      card.fields.map((f) => [f.label, f.type]),
      [
        ['银行', 'text'],
        ['卡号', 'text'],
        ['持卡人', 'text'],
        ['有效期', 'text'],
        ['CVV', 'password'],
        ['取款密码', 'password'],
        ['手机号', 'phone'],
      ],
    )
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.waitForURL(`${base}/`)
  })

  // --- notebooks ---------------------------------------------------------------

  const noteFiles = async () => {
    const out = []
    for (const p of (await drive()).filter((p) => p.startsWith('notes/'))) out.push(JSON.parse(await readFile(p)))
    return out
  }
  const editor = page.locator('[data-page-editor]')

  await step('the demo notebooks show in the sidebar and open a page', async () => {
    await page.locator('[data-note-row="section"]', { hasText: '订阅与续费' }).click()
    await editor.waitFor()
    assert.equal(await page.locator('[data-page-title]').inputValue(), '11 月续费')
    assert.ok((await editor.textContent()).includes('Google Workspace'))
  })

  await step('a new notebook comes with a section and a page, and can be renamed', async () => {
    await page.getByRole('button', { name: '新建笔记本' }).first().click()
    const rename = page.locator('[data-note-row="notebook"] input')
    await rename.waitFor()
    await rename.fill('冒烟测试本')
    await page.keyboard.press('Enter')
    await page.locator('[data-note-row="notebook"]', { hasText: '冒烟测试本' }).waitFor()
    await page.locator('[data-page-editor]').waitFor()
  })

  await step('typing a title and rich text saves the page to notes/ and readable/', async () => {
    const title = page.locator('[data-page-title]')
    await title.click()
    await title.fill('代理清单')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/h2')
    await page.locator('[data-slash-menu]').waitFor()
    await page.keyboard.press('Enter')
    await page.keyboard.type('洛杉矶')
    await page.keyboard.press('Enter')
    await page.keyboard.type('端口 ')
    await page.keyboard.press('Control+b')
    await page.keyboard.type('8080')
    await page.keyboard.press('Control+b')
    await page.keyboard.press('Enter')
    await page.keyboard.type('[] 续费')
    await page.locator('[data-page-row]', { hasText: '代理清单' }).waitFor()
    await page.waitForTimeout(5200) // typing pushes are batched (4 s)
    await waitSynced()
    const pageNote = (await noteFiles()).find((n) => n.title === '代理清单')
    assert.ok(pageNote, 'page file on the drive')
    assert.equal(pageNote.format, 'aicialnote.note')
    const body = JSON.stringify(pageNote.content)
    assert.ok(body.includes('"heading"') && body.includes('洛杉矶'), 'heading via / menu')
    assert.ok(body.includes('"bold"') && body.includes('8080'), 'bold via Ctrl+B')
    assert.ok(body.includes('"taskList"'), 'task list via [] shortcut')
    const md = (await drive()).find((p) => p.startsWith('readable/笔记/代理清单'))
    assert.ok(md, 'readable markdown copy')
    const text = await readFile(md)
    assert.ok(text.includes('## 洛杉矶') && text.includes('**8080**') && text.includes('- [ ] 续费'), text)
  })

  await step('pasting an HTML table (as from OneNote) keeps the table', async () => {
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.evaluate(() => {
      const html = '<table><tr><td>IP</td><td>端口</td></tr><tr><td>1.2.3.4</td><td>1080</td></tr></table>'
      const data = new DataTransfer()
      data.setData('text/html', html)
      data.setData('text/plain', 'IP\t端口\n1.2.3.4\t1080')
      document
        .querySelector('[data-page-editor]')
        .dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await page.locator('[data-page-editor] table').waitFor()
    assert.equal(await page.locator('[role="dialog"]').count(), 0, 'smart paste stays out of the editor')
  })

  await step('Tab in the page list makes a subpage; the move is saved', async () => {
    const before = page.url()
    await page.getByRole('button', { name: '新建页面' }).click()
    await page.waitForURL((u) => u.href !== before)
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-page-title'))
    await page.locator('[data-page-title]').fill('子页面一')
    await page.keyboard.press('Enter')
    const row = page.locator('[data-page-row]', { hasText: '子页面一' })
    await row.click()
    await page.keyboard.press('Tab')
    await page.waitForFunction(
      () => document.querySelector('[data-page-row][aria-level="2"]')?.textContent?.includes('子页面一'),
      null,
      { timeout: 3000 },
    )
    await page.waitForTimeout(1200)
    await waitSynced()
    const files = await noteFiles()
    const parent = files.find((n) => n.title === '代理清单')
    const child = files.find((n) => n.title === '子页面一')
    assert.equal(child.parentId, parent.id)
  })

  await step('dragging a page above another reorders it', async () => {
    const parentRow = page.locator('[data-page-row]', { hasText: '代理清单' })
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(300)
    const child = page.locator('[data-page-row]', { hasText: '子页面一' })
    await child.dragTo(parentRow, { targetPosition: { x: 40, y: 2 } })
    await page.waitForTimeout(300)
    const titles = await page.locator('[data-page-row]').allTextContents()
    assert.deepEqual(titles.slice(0, 2), ['子页面一', '代理清单'])
  })

  await step('deleting a section moves its pages to trash/, undo restores them', async () => {
    // Double-click renames; give the section a unique name (the demo has another "快速笔记").
    await page.locator('[data-note-row="section"]', { hasText: '快速笔记' }).last().dblclick()
    await page.locator('[data-note-row="section"] input').fill('冒烟分区')
    await page.keyboard.press('Enter')
    const section = page.locator('[data-note-row="section"]', { hasText: '冒烟分区' })
    await section.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除分区' }).click()
    await section.waitFor({ state: 'detached' })
    await page.locator('button:not([aria-label])', { hasText: '撤销' }).click()
    await section.waitFor()

    await section.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除分区' }).click()
    await section.waitFor({ state: 'detached' })
    await page.waitForTimeout(7000)
    await waitSynced()
    const files = await noteFiles()
    assert.ok(!files.some((n) => n.title === '代理清单' || n.title === '冒烟分区'), 'section and pages left notes/')
    assert.ok(
      files.some((n) => n.title === '本周待办'),
      'the other section is untouched',
    )
    const trash = (await drive()).filter((p) => p.startsWith('trash/'))
    let found = 0
    for (const p of trash) if ((await readFile(p)).includes('代理清单')) found++
    assert.equal(found, 1, 'page kept in trash/')
  })

  await step('Ctrl+K finds pages by their content', async () => {
    await page.keyboard.press('Control+k')
    await page.keyboard.type('聊天工具')
    await page.getByRole('option', { name: /新同事入职/ }).waitFor()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-page-title]')?.value === '新同事入职')
  })

  // --- accounts inside notebooks --------------------------------------------------

  const itemFiles = async () => {
    const out = []
    for (const p of (await drive()).filter((p) => p.startsWith('items/'))) out.push(JSON.parse(await readFile(p)))
    return out
  }
  const newMenu = async (name) => {
    await page.locator('[data-pages-pane] button[aria-label="更多新建方式"]').click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }

  let listId
  await step('a section can hold an account list; pasting into it files the accounts there', async () => {
    await page.locator('[data-note-row="section"]', { hasText: '登录账号' }).click()
    await page.locator('[data-row-kind]').first().waitFor()
    await newMenu('新建账号列表')
    const title = page.locator('[data-account-list] [data-page-title], [data-page-title]').first()
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-page-title'))
    await title.fill('冒烟账号列表')
    await page.keyboard.press('Enter')
    listId = page.url().split('/p/')[1]
    await page.getByRole('button', { name: '粘贴导入' }).first().click()
    await page.locator('textarea').fill('list1@gmail.com----Pw1\nlist2@gmail.com----Pw2')
    await page.getByRole('button', { name: /创建 2 个/ }).click()
    await page.getByText('已创建 2 个 ID').waitFor()
    const list = page.locator('[data-row-kind="accountList"]', { hasText: '冒烟账号列表' })
    await list.waitFor()
    assert.equal(await page.locator('[data-account-list] [role="row"]').count(), 2, 'table shows the two accounts')
    await page.waitForTimeout(1200)
    await waitSynced()
    const listNote = (await noteFiles()).find((n) => n.id === listId)
    assert.equal(listNote?.kind, 'accountList')
    const filed = (await itemFiles()).filter((i) => i.location?.parentId === listId)
    assert.deepEqual(filed.map((i) => i.name).sort(), ['list1', 'list2'])
  })

  let loneId
  await step('a single account can sit directly in a section, and Tab files it into the list above', async () => {
    await newMenu('新建账号')
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-item-name'))
    await page.keyboard.type('单独账号')
    await page.keyboard.press('Enter')
    loneId = page.url().split('/p/')[1]
    const row = page.locator(`[data-page-row="${loneId}"]`)
    await row.waitFor()
    assert.equal(await row.getAttribute('aria-level'), '1', 'directly in the section')
    await page.waitForTimeout(1200)
    await waitSynced()
    const sectionId = (await noteFiles()).find((n) => n.title === '登录账号').id
    assert.equal((await itemFiles()).find((i) => i.id === loneId).location.parentId, sectionId)

    await row.click()
    await page.keyboard.press('Tab')
    await page.waitForFunction(
      (id) => document.querySelector(`[data-page-row="${id}"]`)?.getAttribute('aria-level') === '2',
      loneId,
    )
    await page.waitForTimeout(1200)
    await waitSynced()
    assert.equal((await itemFiles()).find((i) => i.id === loneId).location.parentId, listId)
  })

  await step('the global account list shows where each account is filed', async () => {
    await page.getByRole('link', { name: /^账号/ }).click()
    const row = page.getByRole('row').filter({ hasText: '单独账号' })
    await row.waitFor()
    assert.ok((await row.textContent()).includes('冒烟账号列表'), 'location column')
  })

  await step('deleting a list keeps its accounts (unfiled); Undo files them again', async () => {
    await page.locator('[data-note-row="section"]', { hasText: '登录账号' }).click()
    const list = page.locator('[data-row-kind="accountList"]', { hasText: '冒烟账号列表' })
    await list.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除账号列表' }).click()
    await page.getByText(/3 个账号已移到「未归档」/).waitFor()
    await list.waitFor({ state: 'detached' })
    assert.equal(await page.locator(`[data-page-row="${loneId}"]`).count(), 0)
    await page.locator('button:not([aria-label])', { hasText: '撤销' }).click()
    await page.locator(`[data-page-row="${loneId}"]`).waitFor()

    await list.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除账号列表' }).click()
    await list.waitFor({ state: 'detached' })
    await page.waitForTimeout(7000)
    await waitSynced()
    const items = await itemFiles()
    const mine = items.filter((i) => ['list1', 'list2', '单独账号'].includes(i.name))
    assert.equal(mine.length, 3, 'accounts still exist')
    assert.ok(
      mine.every((i) => !i.location),
      'and are unfiled',
    )
    assert.ok(!(await noteFiles()).some((n) => n.id === listId), 'list note removed')
  })

  // --- local folder ------------------------------------------------------------
  // The folder picker can't be automated, so hand the app the browser's private
  // file system instead. It is the same FileSystemDirectoryHandle API, so the
  // real LocalFolderAdapter runs end to end.

  await step('local folder: data is written as files and survives a reload', async () => {
    const localContext = await browser.newContext({ locale: 'zh-CN' })
    const local = await localContext.newPage()
    local.on('pageerror', (e) => errors.push(e.message))
    await local.addInitScript(() => {
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory()
        return root.getDirectoryHandle('AicialNote-smoke', { create: true })
      }
    })
    await local.goto(base)
    await local.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry('AicialNote-smoke', { recursive: true }).catch(() => {})
    })
    await local.getByRole('button', { name: /本地文件夹/ }).click()
    await local.getByRole('button', { name: '新建笔记本' }).first().click()
    await local.locator('[data-note-row="notebook"] input').press('Enter')
    await local.locator('[data-page-title]').click()
    await local.locator('[data-page-title]').fill('本地页面')
    await local.keyboard.press('Enter')
    await local.keyboard.type('保存在本地文件夹里')
    await local.waitForTimeout(5200)
    await local.getByRole('button', { name: '已同步' }).waitFor({ timeout: 10_000 })

    const files = await local.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('AicialNote-smoke')
      const out = {}
      const walk = async (d, prefix) => {
        for await (const [name, h] of d.entries()) {
          if (h.kind === 'directory') await walk(h, `${prefix}${name}/`)
          else out[`${prefix}${name}`] = await (await h.getFile()).text()
        }
      }
      await walk(dir, '')
      return out
    })
    assert.ok(files['vault.json'], 'vault.json')
    const page = Object.entries(files).find(([p, text]) => p.startsWith('notes/') && text.includes('本地页面'))
    assert.ok(page?.[1].includes('保存在本地文件夹里'), 'page body in notes/')
    assert.ok(
      Object.keys(files).some((p) => p.startsWith('readable/笔记/本地页面')),
      'readable copy',
    )

    // Fresh cache: everything must come back from the folder itself.
    await local.evaluate(async () => {
      for (const db of await indexedDB.databases()) {
        if (db.name?.startsWith('aicialnote-vault-')) indexedDB.deleteDatabase(db.name)
      }
    })
    await local.reload()
    await local.locator('[data-note-row="section"]').first().click()
    await local.locator('[data-page-editor]', { hasText: '保存在本地文件夹里' }).waitFor()
    await localContext.close()
  })

  assert.deepEqual(errors, [], 'no page errors')
  console.log('\nAll smoke checks passed.')
} catch (err) {
  console.log('FAILED')
  console.error(err)
  if (errors.length) console.error('Page errors:', errors)
  // `.shots/` is git-ignored, so a failed run leaves nothing in the repo root.
  const shot = '.shots/smoke-failure.png'
  await page.screenshot({ path: shot })
  console.error(`Screenshot of the failing page: ${shot}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
