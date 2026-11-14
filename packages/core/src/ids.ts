const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomChars(n: number, alphabet: string): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

/**
 * ULID: 26 chars, lexicographically sortable by creation time.
 * Used as the stable internal id and file name of an item.
 */
export function ulid(now = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  return time + randomChars(16, CROCKFORD)
}

/** Short id for cards and fields, unique within an item. */
export function shortId(): string {
  return randomChars(8, 'abcdefghijkmnpqrstuvwxyz23456789')
}

export function formatDisplayId(seq: number): string {
  return `ID-${String(seq).padStart(4, '0')}`
}
