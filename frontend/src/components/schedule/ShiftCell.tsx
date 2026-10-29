import { getShiftStyle, getLeaveTypeStyle, getDesignatedOffStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

interface ShiftCellProps {
  shift: string
  source?: string
  dense?: boolean
  pending?: boolean
  selected?: boolean
  disabled?: boolean
  leaveType?: { name?: string; color_bg?: string; color_text?: string } | null
  /** 整天特休的「特 N」編號（僅 leave_type=SPECIAL 時傳入） */
  sequence?: number | null
  onClick?: () => void
  onPointerDown?: () => void
  onPointerEnter?: () => void
}

export function ShiftCell({
  shift,
  source,
  dense,
  pending,
  selected,
  disabled,
  leaveType,
  sequence,
  onClick,
  onPointerDown,
  onPointerEnter,
}: ShiftCellProps) {
  const leaveStyle = shift === 'SPECIAL' ? getLeaveTypeStyle(leaveType) : null
  const designatedStyle = shift === 'OFF' && source === 'designated' ? getDesignatedOffStyle() : null
  const style = leaveStyle ?? designatedStyle ?? getShiftStyle(shift)
  const inline = leaveStyle !== null || designatedStyle !== null
  const label = shift === 'SPECIAL' && sequence != null ? `特${sequence}` : style.label

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      disabled={disabled}
      className={cn(
        'relative flex items-center justify-center rounded text-xs font-semibold transition',
        !inline && style.bg,
        !inline && style.text,
        dense ? 'h-6 w-9' : 'h-7 w-9',
        disabled ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-brand-400',
        selected && 'ring-2 ring-brand-500 ring-offset-1',
        pending && 'z-10 scale-105 shadow-sm ring-2 ring-blue-600 ring-offset-1',
      )}
      style={inline ? { backgroundColor: style.bg, color: style.text } : undefined}
      title={
        pending
          ? `${label}（尚未儲存變更）`
          : disabled
            ? `${label}（本月已鎖定）`
            : `${label}（點擊修改）`
      }
    >
      {label}
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
