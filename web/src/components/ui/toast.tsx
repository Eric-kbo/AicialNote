import { X } from 'lucide-react'
import { type ReactNode, useEffect, useSyncExternalStore } from 'react'

interface Toast {
  id: number
  message: ReactNode
  action?: { label: string; onClick: () => void }
  duration: number
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

export function toast(message: ReactNode, opts: { action?: Toast['action']; duration?: number } = {}) {
  const t: Toast = {
    id: nextId++,
    message,
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 6000 : 3200),
  }
  toasts = [...toasts.slice(-2), t]
  emit()
  return t.id
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}

export function Toaster() {
  const list = useToasts()
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => (
        <ToastView key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastView({ toast: t }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), t.duration)
    return () => clearTimeout(timer)
  }, [t.id, t.duration])

  return (
    <div className="animate-toast pointer-events-auto flex h-10 max-w-[560px] items-center gap-3 rounded-lg bg-[#1c1b19] pr-1.5 pl-4 text-sm text-white shadow-pop dark:bg-[#2b2b30]">
      <span className="truncate">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="h-7 rounded-md px-2 font-medium text-[#9db2ff] hover:bg-white/10"
          onClick={() => {
            t.action!.onClick()
            dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="inline-flex size-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
        onClick={() => dismiss(t.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
