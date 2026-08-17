import { Lock } from 'lucide-react'
import { getShiftStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

interface ShiftCellProps {
  shift: string
  source?: string
  locked?: boolean
  compact?: boolean
  onClick?: () => void
}

export function ShiftCell({ shift, source, locked, compact, onClick }: ShiftCellProps) {
  const style = getShiftStyle(shift)
  return (
    <button
      type="button"
      disabled={locked}
      onClick={locked ? undefined : onClick}
      className={cn(
        'relative flex items-center justify-center rounded text-xs font-semibold transition',
        style.bg,
        style.text,
        compact ? 'h-7 w-9' : 'h-8 w-10',
        locked
          ? 'cursor-not-allowed opacity-70'
          : 'cursor-pointer hover:ring-2 hover:ring-indigo-400',
      )}
      title={locked ? '大夜專職班次（請至大夜班表修改）' : `${shift}（點擊修改）`}
    >
      {locked ? (
        <Lock className="h-3 w-3 opacity-60" />
      ) : (
        style.label
      )}
      {source === 'manual' && (
        <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-blue-500" />
      )}
      {source === 'night_input' && !locked && (
        <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-gray-400" />
      )}
    </button>
  )
}
