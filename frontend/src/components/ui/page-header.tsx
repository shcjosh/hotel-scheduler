import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** 標題右側的狀態 pill／徽章。 */
  meta?: ReactNode
  /** 頁面主要與次要動作，會自動換行。 */
  actions?: ReactNode
  className?: string
}

/**
 * 頁面層級標題列。Header 只顯示模組名稱（由路由決定），
 * 頁面自己的標題、副標與動作集中在這裡，避免兩處重複。
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-xl font-semibold text-slate-800">{title}</h2>
          {meta}
        </div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      )}
    </div>
  )
}
