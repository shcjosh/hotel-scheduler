import { CircleCheck, CircleAlert, Info, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ToastContext,
  type ToastItem,
  type ToastTone,
} from '../../hooks/useToast'
import { cn } from '../../utils/cn'

const TONE_META: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-emerald-600' },
  error: { icon: CircleAlert, className: 'text-red-600' },
  info: { icon: Info, className: 'text-blue-600' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, options?: { description?: string; tone?: ToastTone; duration?: number }) => {
      const id = nextId.current++
      setItems((prev) => [
        ...prev,
        { id, message, description: options?.description, tone: options?.tone ?? 'success' },
      ])
      const timer = window.setTimeout(() => dismiss(id), options?.duration ?? 4000)
      timers.current.push(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => {
          const meta = TONE_META[item.tone]
          const Icon = meta.icon
          return (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-popover"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{item.message}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="關閉通知"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
