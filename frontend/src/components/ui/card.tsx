import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface CardProps {
  children: ReactNode
  className?: string
  /** 是否加上內距（表格類內容通常設 false，交由 table 自己控制）。 */
  padded?: boolean
}

/** 一致的卡片外框：白底、slate 邊框、card 陰影。 */
export function Card({ children, className, padded = false }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white shadow-card',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
