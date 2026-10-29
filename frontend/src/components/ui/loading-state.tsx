import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

interface LoadingStateProps {
  label?: string
  className?: string
}

/** 頁面／區塊載入中。 */
export function LoadingState({ label = '載入中…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500',
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

/** 表格／卡片載入中的佔位塊。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-200/70', className)} />
}
