import { getShiftStyle, getLeaveTypeStyle, getDesignatedOffStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

interface ShiftCellProps {
  shift: string
  source?: string
  compact?: boolean
  pending?: boolean
  leaveType?: { name?: string; color_bg?: string; color_text?: string } | null
  onClick?: () => void
}

export function ShiftCell({ shift, source, compact, pending, leaveType, onClick }: ShiftCellProps) {
  const leaveStyle = shift === 'SPECIAL' ? getLeaveTypeStyle(leaveType) : null
  const designatedStyle = shift === 'OFF' && source === 'designated' ? getDesignatedOffStyle() : null
  const style = leaveStyle ?? designatedStyle ?? getShiftStyle(shift)
  const inline = leaveStyle !== null || designatedStyle !== null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center rounded text-xs font-semibold transition',
        !inline && style.bg,
        !inline && style.text,
        compact ? 'h-7 w-9' : 'h-8 w-10',
        'cursor-pointer hover:ring-2 hover:ring-indigo-400',
        pending && 'ring-2 ring-blue-600 ring-offset-1 scale-105 z-10 shadow-sm',
      )}
      style={inline ? { backgroundColor: style.bg, color: style.text } : undefined}
      title={pending ? `${style.label}（尚未儲存變更）` : `${style.label}（點擊修改）`}
    >
      {style.label}
      {pending && (
        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
        </span>
      )}
      {!pending && source === 'manual' && (
        <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-blue-500" />
      )}
    </button>
  )
}
