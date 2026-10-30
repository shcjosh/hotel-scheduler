import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface ToolbarProps {
  children: ReactNode
  className?: string
  /** 捲動時吸附在頂端（表格頁用）。 */
  sticky?: boolean
}

/** 水平工具列：一致的邊框、內距與換行行為。 */
export function Toolbar({ children, className, sticky = false }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card',
        sticky && 'sticky top-0 z-30 bg-white/95 backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  )
}
