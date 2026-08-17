import type { DailyCoverageStats } from '../../api/stats'
import { getWeekdayLabel } from '../../utils/date'
import { cn } from '../../utils/cn'

const SHIFTS = ['A', 'B', 'C', 'D', 'M'] as const

export function DailyCoverageTable({ rows }: { rows: DailyCoverageStats[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">日期</th>
            <th className="px-3 py-2 text-left">星期</th>
            {SHIFTS.map((s) => (
              <th key={s} className="px-2 py-2 text-right">{s}</th>
            ))}
            <th className="px-2 py-2 text-right">總人數</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const weekend = r.weekday === 0 || r.weekday === 6
            return (
              <tr key={r.day} className={cn('border-t border-gray-100', weekend && 'bg-gray-50')}>
                <td className="px-3 py-1.5 font-medium text-gray-800">{r.day}</td>
                <td className={cn('px-3 py-1.5', weekend ? 'text-red-500' : 'text-gray-500')}>
                  {getWeekdayLabel(r.weekday)}
                </td>
                {SHIFTS.map((s) => (
                  <td key={s} className={cn('px-2 py-1.5 text-right', (s === 'A' || s === 'C') && r[s] === 0 ? 'font-bold text-red-600' : 'text-gray-600')}>
                    {r[s]}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold text-gray-800">{r.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
