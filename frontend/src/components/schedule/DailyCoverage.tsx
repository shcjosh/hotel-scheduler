import type { MonthScheduleView } from '../../types'
import { isWeekend } from '../../utils/date'
import { cn } from '../../utils/cn'

interface DailyCoverageProps {
  view: MonthScheduleView
}

const WORK_SHIFTS = ['A', 'B', 'C', 'D'] as const

export function DailyCoverage({ view }: DailyCoverageProps) {
  const { schedule, num_days: numDays, year, month } = view

  const dayCounts = Array.from({ length: numDays }, (_, d) => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
    for (const row of Object.values(schedule)) {
      const s = row[d]
      if (s in counts) counts[s] += 1
    }
    return counts
  })

  return (
    <tfoot className="sticky bottom-0">
      <tr className="border-t-2 border-gray-300 bg-gray-100">
        <th className="sticky left-0 z-10 bg-gray-100 px-2 py-1 text-right text-xs font-semibold text-gray-600">
          覆蓋
        </th>
        {dayCounts.map((c, d) => {
          const day = d + 1
          const weekend = isWeekend(year, month, day)
          const danger = c.A === 0 || c.C === 0
          return (
            <td
              key={day}
              className={cn(
                'px-1 py-1 text-center align-top',
                weekend && 'bg-gray-200',
              )}
            >
              <div
                className={cn(
                  'rounded px-0.5 py-0.5 text-[10px] leading-tight',
                  danger ? 'bg-red-100 text-red-700' : 'text-gray-600',
                )}
              >
                {danger && <div className="font-bold">!</div>}
                {WORK_SHIFTS.map((s) => (
                  <div key={s}>
                    {s}:{c[s]}
                  </div>
                ))}
              </div>
            </td>
          )
        })}
      </tr>
    </tfoot>
  )
}
