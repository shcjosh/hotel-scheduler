import { CircleCheck, CircleDashed, Lock } from 'lucide-react'
import { cn } from '../../utils/cn'
import { STATUS_LABELS } from '../../utils/scheduleStatus'
import type { ScheduleStatus } from '../../types'

const META: Record<
  ScheduleStatus,
  { icon: typeof Lock; className: string }
> = {
  draft: {
    icon: CircleDashed,
    className: 'bg-status-warning-soft text-amber-700 ring-amber-200',
  },
  published: {
    icon: CircleCheck,
    className: 'bg-status-success-soft text-emerald-700 ring-emerald-200',
  },
  locked: {
    icon: Lock,
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
}

interface StatusPillProps {
  status: ScheduleStatus
  size?: 'sm' | 'md'
  className?: string
}

/** 草稿／已發布／已鎖定：lucide icon + 文字（取代原本的 emoji）。 */
export function StatusPill({ status, size = 'md', className }: StatusPillProps) {
  const meta = META[status]
  const Icon = meta.icon
  const label = STATUS_LABELS[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        meta.className,
        className,
      )}
      title={`班表狀態：${label}`}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {label}
    </span>
  )
}
