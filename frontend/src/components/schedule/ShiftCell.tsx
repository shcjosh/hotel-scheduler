import { Lock } from 'lucide-react'
import { getShiftStyle, getLeaveTypeStyle, getDesignatedOffStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

interface ShiftCellProps {
  shift: string
  source?: string
  locked?: boolean
  compact?: boolean
  leaveType?: { name?: string; color_bg?: string; color_text?: string } | null
  onClick?: () => void
}

export function ShiftCell({ shift, source, locked, compact, leaveType, onClick }: ShiftCellProps) {
  const leaveStyle = shift === 'SPECIAL' ? getLeaveTypeStyle(leaveType) : null
  const designatedStyle = shift === 'OFF' && source === 'designated' ? getDesignatedOffStyle() : null
  const style = leaveStyle ?? designatedStyle ?? getShiftStyle(shift)
  const inline = leaveStyle !== null || designatedStyle !== null

  return (
    <button
      type="button"
      disabled={locked}
      onClick={locked ? undefined : onClick}
      className={cn(
        'relative flex items-center justify-center rounded text-xs font-semibold transition',
        !inline && style.bg,
        !inline && style.text,
        compact ? 'h-7 w-9' : 'h-8 w-10',
        locked ? 'cursor-not-allowed' : 'cursor-pointer hover:ring-2 hover:ring-indigo-400',
      )}
      style={inline ? { backgroundColor: style.bg, color: style.text } : undefined}
      title={locked ? '大夜專職班次（請至大夜班表修改）' : `${style.label}（點擊修改）`}
    >
      {style.label}
      {locked && (
        <span className="absolute bottom-0 right-0 rounded-full bg-gray-400 p-0.5 text-white">
          <Lock className="h-2 w-2" />
        </span>
      )}
      {!locked && source === 'manual' && (
        <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-blue-500" />
      )}
    </button>
  )
}
