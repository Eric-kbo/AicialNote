import {
  createCard,
  createField,
  createItem,
  createNote,
  createVaultMeta,
  type Item,
  type Locale,
  type Note,
  type NoteDoc,
  orderBetween,
  VaultRemote,
} from '@aicialnote/core'
import { MemoryAdapter } from '@aicialnote/storage'

/** Fills an in-memory drive with realistic sample data for the demo mode. */
export async function createDemoStorage(locale: Locale): Promise<MemoryAdapter> {
  const storage = new MemoryAdapter()
  const remote = new VaultRemote(storage)
  const meta = createVaultMeta(locale)
  const zh = locale === 'zh'
  const day = 86_400_000
  const now = Date.now()
  const iso = (offsetDays: number) => {
    const d = new Date(now + offsetDays * day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Fictional people. Handles carry a "demo" marker so they don't look like
  // anyone's real address in screenshots.
  const people = [
    ['Linda Russo', 'linda.russo.demo', 'active', ['家庭', '重要'], 'gmail.com'],
    ['Marcus Hale', 'marcus.hale.demo', 'active', ['工作'], 'gmail.com'],
    ['Nora Lindqvist', 'nora.lindqvist.demo', 'active', ['工作'], 'outlook.com'],
    ['Kenji Arai', 'kenji.arai.demo', 'attention', ['测试'], 'gmail.com'],
    ['Ava Brooks', 'ava.brooks.demo', 'active', ['个人'], 'gmail.com'],
    ['Lucas Moreau', 'lucas.moreau.demo', 'banned', ['测试'], 'hotmail.com'],
    ['Priya Raman', 'priya.raman.demo', 'active', ['客户'], 'gmail.com'],
    ['Ethan Cole', 'ethan.cole.demo', 'attention', ['工作'], 'gmail.com'],
    ['Sofia Russo', 'sofia.russo.demo', 'active', ['家庭'], 'icloud.com'],
    ['Daniel Kim', 'daniel.kim.demo', 'retired', [], 'gmail.com'],
    ['Mia Fischer', 'mia.fischer.demo', 'active', ['客户'], 'outlook.com'],
    ['Oliver Grant', 'oliver.grant.demo', 'active', ['工作', '重要'], 'gmail.com'],
  ] as const

  const tagMap: Record<string, string> = {
    家庭: 'Family',
    重要: 'Important',
    工作: 'Work',
    个人: 'Personal',
    客户: 'Client',
    测试: 'Testing',
  }
  const secret = () => {
    const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    return Array.from({ length: 32 }, () => a[Math.floor(Math.random() * 32)]).join('')
  }
  const password = () => {
    const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%'
    return Array.from({ length: 14 }, () => a[Math.floor(Math.random() * a.length)]).join('')
  }

  const items: Item[] = people.map(([name, handle, status, tags, domain], i) => {
    const item = createItem({ seq: i + 1, name, status, now: new Date(now - (i * 37 + 5) * 3_600_000) })
    item.tags = tags.map((t) => (zh ? t : tagMap[t]!))
    const provider = domain === 'gmail.com' ? 'google' : domain === 'icloud.com' ? 'apple' : 'microsoft'
    const main = createCard(provider, locale)
    const set = (role: string, value: string) => {
      const f = main.fields.find((x) => x.role === role)
      if (f) f.value = value
    }
    set('account', `${handle}@${domain}`)
    set('password', password())
    if (i % 3 !== 2) set('totp', secret())
    set('recovery', `${handle.split('.')[0]}.backup.demo@${domain === 'gmail.com' ? 'outlook.com' : 'gmail.com'}`)
    if (i % 2 === 0) set('phone', `+1 ${300 + i * 7} 555 01${String(10 + i).slice(-2)}`)
    set('region', zh ? '美国' : 'United States')
    item.cards.push(main)

    if (i % 4 === 0) {
      const apple = createCard('apple', locale)
      apple.fields[0]!.value = `${handle}@icloud.com`
      apple.fields[1]!.value = password()
      apple.fields[3]!.value = zh ? '美国' : 'United States'
      item.cards.push(apple)
    }
    if (i % 3 === 0) {
      const proxy = createCard('proxy', locale)
      // 198.51.100.0/24 is reserved for documentation (RFC 5737).
      proxy.fields[0]!.value = `198.51.100.${40 + i * 3}:${8000 + i}`
      proxy.fields[1]!.value = `px${handle.slice(0, 5)}`
      proxy.fields[2]!.value = password().slice(0, 10)
      proxy.fields[3]!.value = zh ? '美国 · 洛杉矶' : 'US · Los Angeles'
      proxy.fields[4]!.value = iso(i === 0 ? 5 : i === 3 ? -2 : 24 + i)
      item.cards.push(proxy)
    }
    if (i === 0) {
      const custom = createCard('custom', locale)
      custom.title = zh ? '订阅信息' : 'Subscription'
      custom.fields = [
        createField({ label: zh ? '套餐' : 'Plan', type: 'text', value: 'Google One 2 TB' }),
        createField({ label: zh ? '价格' : 'Price', type: 'text', value: zh ? '$9.99 / 月' : '$9.99 / month' }),
        createField({ label: zh ? '下次续费' : 'Renews on', type: 'date', value: iso(21) }),
      ]
      item.cards.push(custom)
      item.notes = zh
        ? '家庭共享的主账号，云盘和相册都在这里。\n改密码前先告诉家里人；恢复码打印了一份，放在书房抽屉里。'
        : 'The shared family account; the drive and photos live here.\nTell everyone before changing the password. A printed copy of the recovery codes is in the study drawer.'
    }
    return item
  })

  // File some accounts into the "Logins" section: Google ones into a list,
  // one iCloud account on its own. The rest stay unfiled.
  const { notes, loginsId, googleListId } = demoNotes(zh, now)
  let order = 'a0'
  for (const item of items.filter((i) => i.cards[0]?.template === 'google').slice(0, 5)) {
    item.location = { parentId: googleListId, order }
    order = orderBetween(order, null)
  }
  const icloud = items.find((i) => i.cards[0]?.template === 'apple')
  if (icloud) icloud.location = { parentId: loginsId, order: 'a2' }

  meta.nextSeq = items.length + 1
  await remote.initMeta(meta)
  for (const item of items) {
    await remote.writeItem(item, { etag: null })
    await remote.writeReadable(item, meta)
  }
  await remote.writeDerived(items, meta)
  for (const note of notes) await remote.writeNote(note, { etag: null })
  return storage
}

// --- notebooks -----------------------------------------------------------------

type Inline = string | { text: string; marks: string[] }
const txt = (parts: Inline[]) =>
  parts.map((p) =>
    typeof p === 'string'
      ? { type: 'text', text: p }
      : { type: 'text', text: p.text, marks: p.marks.map((type) => ({ type })) },
  )
const p = (...parts: Inline[]) => ({ type: 'paragraph', content: txt(parts) })
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: txt([text]) })
const ul = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
})
const ol = (...items: string[]) => ({
  type: 'orderedList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
})
const tasks = (...items: Array<[string, boolean]>) => ({
  type: 'taskList',
  content: items.map(([i, checked]) => ({ type: 'taskItem', attrs: { checked }, content: [p(i)] })),
})
const table = (rows: string[][]) => ({
  type: 'table',
  content: rows.map((r, i) => ({
    type: 'tableRow',
    content: r.map((c) => ({ type: i === 0 ? 'tableHeader' : 'tableCell', content: [p(c)] })),
  })),
})
const doc = (...content: object[]): NoteDoc => ({ type: 'doc', content: content as NoteDoc['content'] })

function demoNotes(zh: boolean, now: number): { notes: Note[]; loginsId: string; googleListId: string } {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000)
  const L = (z: string, e: string) => (zh ? z : e)
  const out: Note[] = []
  const add = (n: Parameters<typeof createNote>[0]) => {
    const note = createNote(n)
    out.push(note)
    return note
  }

  const work = add({
    kind: 'notebook',
    parentId: null,
    order: 'a0',
    title: L('工作', 'Work'),
    color: 'blue',
    now: at(400),
  })
  const logins = add({
    kind: 'section',
    parentId: work.id,
    order: orderBetween(null, 'a0'),
    title: L('登录账号', 'Logins'),
    color: 'blue',
    now: at(420),
  })
  add({
    kind: 'page',
    parentId: logins.id,
    order: 'a0',
    title: L('分组说明', 'How these are grouped'),
    now: at(410),
    content: doc(
      p(
        L(
          'Google 账号统一放在「Google 账号列表」里，单独使用的账号直接放在分区下。',
          'Google accounts live in the Google list; accounts used on their own sit directly in the section.',
        ),
      ),
      p(
        L(
          '在列表里按 Ctrl+V 粘贴，复制来的账号资料会直接进这个列表。',
          'Press Ctrl+V on a list to paste account details straight into it.',
        ),
      ),
    ),
  })
  const googleList = add({
    kind: 'accountList',
    parentId: logins.id,
    order: 'a1',
    title: L('Google 账号列表', 'Google accounts'),
    now: at(410),
  })
  const billing = add({
    kind: 'section',
    parentId: work.id,
    order: 'a0',
    title: L('订阅与续费', 'Subscriptions'),
    color: 'green',
    now: at(400),
  })
  const nov = add({
    kind: 'page',
    parentId: billing.id,
    order: 'a0',
    title: L('11 月续费', 'November renewals'),
    now: at(30),
    content: doc(
      p(
        L('本月共续费 ', 'Renewed '),
        { text: L('3 项', '3'), marks: ['bold'] },
        L(
          ' 团队订阅，账号都已录入「账号」。',
          ' team subscriptions this month; their logins are filed under Accounts.',
        ),
      ),
      table([
        [L('日期', 'Date'), L('服务', 'Service'), L('席位', 'Seats'), L('金额', 'Amount')],
        ['11-02', 'Google Workspace', '5', '$36.00'],
        ['11-05', 'Figma', '3', '$45.00'],
        ['11-07', 'GitHub Team', '4', '$16.00'],
      ]),
      h(2, L('注意事项', 'Notes')),
      ul(
        L('到期前 7 天检查付款方式', 'Check the payment method 7 days before each renewal'),
        L('同事离职当天回收席位', 'Remove seats on the day someone leaves'),
      ),
    ),
  })
  add({
    kind: 'page',
    parentId: nov.id,
    order: 'a0',
    title: L('账单联系人', 'Billing contacts'),
    now: at(29),
    content: doc(
      ul(
        L('财务 — billing@example.com', 'Finance — billing@example.com'),
        L('Workspace 管理员 — admin@example.com（工作日回复）', 'Workspace admin — admin@example.com (weekdays)'),
      ),
    ),
  })
  add({
    kind: 'page',
    parentId: billing.id,
    order: 'a1',
    title: L('10 月续费', 'October renewals'),
    now: at(300),
    content: doc(
      p(
        L(
          '10 月续费 3 项，其中 1 项因信用卡过期失败，已更新付款方式。',
          '3 renewals in October; one failed on an expired card and the payment method was updated.',
        ),
      ),
    ),
  })

  const team = add({
    kind: 'section',
    parentId: work.id,
    order: 'a1',
    title: L('团队与网络', 'Team & network'),
    color: 'purple',
    now: at(380),
  })
  add({
    kind: 'page',
    parentId: team.id,
    order: 'a0',
    title: L('新同事入职', 'Onboarding'),
    now: at(60),
    content: doc(
      h(1, L('第一天', 'Day one')),
      ol(
        L('创建公司邮箱，发送一次性临时密码', 'Create the work email and send a one-time password'),
        L('首次登录后让对方立即修改密码', 'Have them change the password on first sign-in'),
        L('一起开启 2FA，把恢复码存进 AicialNote', 'Turn on 2FA together and save the recovery codes in AicialNote'),
      ),
      {
        type: 'blockquote',
        content: [p(L('不要通过聊天工具发送密码。', 'Never send passwords over chat.'))],
      },
      h(2, L('检查清单', 'Checklist')),
      tasks(
        [L('已加入团队共享盘', 'Added to the team drive'), true],
        [L('已分配测试用代理', 'Test proxy assigned'), true],
        [L('已开启 2FA 并保存密钥', '2FA enabled and secret saved'), false],
      ),
    ),
  })
  add({
    kind: 'page',
    parentId: team.id,
    order: 'a1',
    title: L('代理格式说明', 'Proxy formats'),
    now: at(90),
    content: doc(
      p(
        L(
          '测试代理常见的几种写法，粘贴到「账号」时都能自动识别：',
          'Common ways to write a test proxy; all of them are recognised by smart paste:',
        ),
      ),
      {
        type: 'codeBlock',
        attrs: { language: null },
        content: [
          {
            type: 'text',
            text: '203.0.113.4:8080:user:pass\nsocks5://user:pass@203.0.113.4:1080\nuser:pass@203.0.113.4:8080',
          },
        ],
      },
    ),
  })

  const personal = add({
    kind: 'notebook',
    parentId: null,
    order: 'a1',
    title: L('个人', 'Personal'),
    color: 'yellow',
    now: at(200),
  })
  const quick = add({
    kind: 'section',
    parentId: personal.id,
    order: 'a0',
    title: L('快速笔记', 'Quick notes'),
    color: 'yellow',
    now: at(200),
  })
  add({
    kind: 'page',
    parentId: quick.id,
    order: 'a0',
    title: L('本周待办', 'This week'),
    now: at(5),
    content: doc(
      tasks(
        [L('续费 3 个即将到期的代理', 'Renew the 3 proxies that are about to expire'), false],
        [L('整理 10 月的账号状态', 'Review October account statuses'), true],
        [L('把 OneNote 里剩下的页面搬过来', 'Move the remaining OneNote pages over'), false],
      ),
    ),
  })
  return { notes: out, loginsId: logins.id, googleListId: googleList.id }
}
