import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastOptions {
  description?: string
  tone?: ToastTone
  /** 毫秒，預設 4000。 */
  duration?: number
}

export interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void
}

export interface ToastItem {
  id: number
  message: string
  description?: string
  tone: ToastTone
}

export const ToastContext = createContext<ToastContextValue | null>(null)

const fallback: ToastContextValue = {
  toast: (message) => {
    // Provider 遺漏時仍不要讓呼叫端爆掉（正常情況不會發生）。
    console.warn('[toast]', message)
  },
}

/** 取得 toast 函式：`const toast = useToast(); toast('已儲存')`。 */
export function useToast() {
  return (useContext(ToastContext) ?? fallback).toast
}
