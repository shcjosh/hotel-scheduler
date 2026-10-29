import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  info: 'bg-status-info-soft text-blue-700 ring-blue-200',
  success: 'bg-status-success-soft text-emerald-700 ring-emerald-200',
  warning: 'bg-status-warning-soft text-amber-700 ring-amber-200',
  danger: 'bg-status-danger-soft text-red-700 ring-red-200',
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

/** 數量、角色、標籤（二館／離職）、狀態等小標籤。 */
export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
