import { absoluteDate } from './utils'

/** Saves text as a file through the browser's normal download. Nothing leaves the device. */
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Local date for file names, e.g. 2026-11-11. */
export function fileDate(now = Date.now()): string {
  return absoluteDate(now)
}
