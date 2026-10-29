import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'

interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  tone?: 'neutral' | 'danger'
  className?: string
}

/** 空狀態／錯誤狀態共用元件（虛線框 + 圖示 + 說明 + CTA）。 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed bg-white px-6 py-12 text-center',
        tone === 'danger' ? 'border-red-200' : 'border-slate-300',
        className,
      )}
    >
      <Icon
        className={cn('mb-3 h-10 w-10', tone === 'danger' ? 'text-red-300' : 'text-slate-300')}
        aria-hidden="true"
      />
      <p className={cn('text-base font-medium', tone === 'danger' ? 'text-red-700' : 'text-slate-700')}>
        {title}
      </p>
      {description && <p className="mt-1 max-w-lg text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
