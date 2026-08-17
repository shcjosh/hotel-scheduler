import { getShiftStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

interface ShiftCellProps {
  shift: string
  compact?: boolean
}

export function ShiftCell({ shift, compact }: ShiftCellProps) {
  const style = getShiftStyle(shift)
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded text-xs font-semibold',
        style.bg,
        style.text,
        compact ? 'h-7 w-9' : 'h-8 w-10',
      )}
    >
      {style.label}
    </div>
  )
}
