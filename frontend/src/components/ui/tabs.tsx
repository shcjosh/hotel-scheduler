import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  badge?: ReactNode
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}

/** 頁內分頁（設定頁、統計頁、休假頁共用）。 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: TabsProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = items.findIndex((item) => item.value === value)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = items[(index + delta + items.length) % items.length]
    onChange(next.value)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('flex flex-wrap gap-1 border-b border-slate-200', className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {item.label}
            {item.badge != null && (
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
