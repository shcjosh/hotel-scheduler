import { SHIFT_DESCRIPTIONS, getShiftStyle } from '../../utils/shift'
import { SHIFT_ORDER } from '../../utils/shift'

export function ShiftLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      <span className="font-medium text-gray-700">圖例：</span>
      {SHIFT_ORDER.map((s) => {
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
    </div>
  )
}
