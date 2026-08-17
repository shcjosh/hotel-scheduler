import type { ShiftStats } from '../../api/stats'
import { getShiftStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'

const SHIFTS = ['A', 'B', 'C', 'D', 'M'] as const

export function ShiftDistributionTable({ perShift }: { perShift: Record<string, ShiftStats> }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">班次</th>
            <th className="px-3 py-2 text-right">總數</th>
            <th className="px-3 py-2 text-right">日均</th>
            <th className="px-3 py-2 text-right">最少</th>
            <th className="px-3 py-2 text-right">最多</th>
          </tr>
        </thead>
        <tbody>
          {SHIFTS.map((s) => {
            const st = perShift[s] ?? { total: 0, per_day_avg: 0, min: 0, max: 0 }
            const style = getShiftStyle(s)
            const lowCov = (s === 'A' || s === 'C') && st.min < 1
            return (
              <tr key={s} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <span className={cn('inline-flex h-6 w-8 items-center justify-center rounded text-xs font-semibold', style.bg, style.text)}>
                    {style.label}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-gray-800">{st.total}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{st.per_day_avg}</td>
                <td className={cn('px-3 py-1.5 text-right', lowCov ? 'font-bold text-red-600' : 'text-gray-600')}>{st.min}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{st.max}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
