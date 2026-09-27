import type { MonthScheduleView } from '../../types'
import { isWeekend } from '../../utils/date'
import { cn } from '../../utils/cn'

interface DailyCoverageProps {
  view: MonthScheduleView
}

// A1 / C1 為二館支援班，視為 A / C 覆蓋；D、D1 一律不列入覆蓋。
function dayCoverage(schedule: Record<string, string[]>, d: number) {
  let a = 0
  let b = 0
  let c = 0
  for (const row of Object.values(schedule)) {
    const s = row[d]
    if (s === 'A' || s === 'A1') a += 1
    else if (s === 'C' || s === 'C1') c += 1
    else if (s === 'B') b += 1
  }
  return { a, b, c }
}

export function DailyCoverage({ view }: DailyCoverageProps) {
  const { schedule, num_days: numDays, year, month } = view

  return (
    <tfoot className="sticky bottom-0">
      <tr className="border-t-2 border-gray-300 bg-gray-100">
        <th className="sticky left-0 z-10 bg-gray-100 px-2 py-1 text-right text-xs font-semibold text-gray-600">
          覆蓋
        </th>
        {Array.from({ length: numDays }, (_, d) => {
          const day = d + 1
          const weekend = isWeekend(year, month, day)
          const { a, b, c } = dayCoverage(schedule, d)
          const okA = a > 0
          const okC = c > 0
          const covered = okA && okC
          const concentric = covered && b > 0
          const missing = [!okA && 'A', !okC && 'C'].filter(Boolean) as string[]
          const title = covered
            ? `${concentric ? 'A/B/C' : 'A/C'} 覆蓋（A${a}${b ? ` B${b}` : ''} C${c}）`
            : `缺 ${missing.join('、')} 班（需要支援）`

          return (
            <td
              key={day}
              className={cn('px-1 py-1.5 text-center align-middle', weekend && 'bg-gray-200')}
            >
              {covered ? (
                <span
                  title={title}
                  aria-label={title}
                  className={cn(
                    'relative inline-block h-3.5 w-3.5 rounded-full border-2 border-green-500',
                    concentric && 'align-middle',
                  )}
                >
                  {concentric && (
                    <span className="absolute inset-[2px] rounded-full bg-green-500" />
                  )}
                </span>
              ) : (
                <span
                  title={title}
                  aria-label={title}
                  className="text-[10px] font-bold leading-none text-red-600"
                >
                  {missing.join('')}
                </span>
              )}
            </td>
          )
        })}
      </tr>
    </tfoot>
  )
}
