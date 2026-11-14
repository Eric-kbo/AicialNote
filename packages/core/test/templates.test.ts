import { describe, expect, it } from 'vitest'
import { createVaultMeta, defaultStatuses, migrateVaultMeta } from '../src/templates'

describe('migrateVaultMeta', () => {
  const withWarming = (locale: 'zh' | 'en', label: string) => {
    const meta = createVaultMeta(locale)
    return { ...meta, statuses: meta.statuses.map((s) => (s.id === 'warming' ? { ...s, label } : s)) }
  }

  it('renames the former default label in both languages', () => {
    expect(migrateVaultMeta(withWarming('zh', '养号中')).statuses).toEqual(defaultStatuses('zh'))
    expect(migrateVaultMeta(withWarming('en', 'Warming up')).statuses).toEqual(defaultStatuses('en'))
  })

  it('returns the same object when nothing needs to change', () => {
    const meta = createVaultMeta('zh')
    expect(migrateVaultMeta(meta)).toBe(meta)
  })

  it('leaves a label the user chose alone', () => {
    const custom = withWarming('zh', '养号中（新号）')
    expect(migrateVaultMeta(custom)).toBe(custom)
  })

  it('only renames the status the old default belonged to', () => {
    const meta = createVaultMeta('zh')
    const other = { ...meta, statuses: [...meta.statuses, { id: 'mine', label: '养号中', color: 'gray' as const }] }
    expect(migrateVaultMeta(other)).toBe(other)
  })

  it('keeps unknown keys and every other setting', () => {
    const old = { ...withWarming('zh', '养号中'), nextSeq: 42, futureKey: { a: 1 } }
    const next = migrateVaultMeta(old)
    expect(next).toMatchObject({ nextSeq: 42, futureKey: { a: 1 }, createdAt: old.createdAt, locale: 'zh' })
  })
})
