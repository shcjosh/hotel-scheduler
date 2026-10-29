import type { ReactNode } from 'react'
import { Card } from './card'
import { cn } from '../../utils/cn'

interface SectionProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** 標題列以下是否加上內距（表格類內容可設 false）。 */
  contentPadded?: boolean
}

/** 卡片 + 區塊標題列，取代各頁手寫的 <h3> + 白底 div。 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentPadded = false,
}: SectionProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={cn(contentPadded && 'p-4')}>{children}</div>
    </Card>
  )
}
