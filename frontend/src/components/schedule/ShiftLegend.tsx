import { SHIFT_DESCRIPTIONS, getShiftStyle, getDesignatedOffStyle } from '../../utils/shift'
import { SHIFT_ORDER } from '../../utils/shift'
import type { LeaveType } from '../../types'

export function ShiftLegend({ leaveTypes = [] }: { leaveTypes?: LeaveType[] }) {
  const designatedStyle = getDesignatedOffStyle()
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      <span className="font-medium text-gray-700">圖例：</span>
      {SHIFT_ORDER.filter((s) => s !== 'SPECIAL').map((s) => {
        const style = getShiftStyle(s)
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={`inline-flex h-5 w-7 items-center justify-center rounded ${style.bg} ${style.text}`}
            >
              {style.label}
            </span>
            <span>{SHIFT_DESCRIPTIONS[s]}</span>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex h-5 w-7 items-center justify-center rounded"
          style={{ backgroundColor: designatedStyle.bg, color: designatedStyle.text }}
        >
          {designatedStyle.label}
        </span>
        <span>指定休假</span>
      </div>
      {leaveTypes.map((lt) => (
        <div key={lt.code} className="flex items-center gap-1.5">
          <span
            className="inline-flex h-5 w-7 items-center justify-center rounded text-[10px]"
            style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
          >
            {lt.name.length > 2 ? lt.name.slice(0, 2) : lt.name}
          </span>
          <span>{lt.name}</span>
        </div>
      ))}
    </div>
  )
}
