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
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <span className="text-gray-400">覆蓋：</span>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-green-500" />
        <span>A/C 覆蓋</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="relative inline-block h-3.5 w-3.5 rounded-full border-2 border-green-500">
          <span className="absolute inset-[2px] rounded-full bg-green-500" />
        </span>
        <span>A/B/C 覆蓋</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold leading-none text-red-600">C</span>
        <span>缺班（需要支援）</span>
      </div>
    </div>
  )
}
