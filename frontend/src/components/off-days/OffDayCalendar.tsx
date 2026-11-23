import { getWeekday, isWeekend } from '../../utils/date'
import { outOfEmploymentReason } from '../../utils/employee'
import type { Employee } from '../../types'
import { cn } from '../../utils/cn'

interface OffDayCalendarProps {
  year: number
  month: number
  numDays: number
  employee?: Pick<Employee, 'hire_date' | 'resign_date'> | null
  designatedDays: Set<number>
  specialDays: Set<number>
  leaveInfoByDay?: Record<number, { label: string; bg: string; text: string }>
  runDays: Set<number>
  onToggleDay: (day: number) => void
  readOnly?: boolean
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export function OffDayCalendar({
  year,
  month,
  numDays,
  employee,
  designatedDays,
  specialDays,
  leaveInfoByDay,
  runDays,
  onToggleDay,
  readOnly = false,
}: OffDayCalendarProps) {
  const firstWeekday = getWeekday(year, month, 1)
  const leadingBlanks = (firstWeekday + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="max-w-3xl overflow-auto rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-1 text-center text-xs font-semibold',
              i >= 5 ? 'text-red-400' : 'text-gray-400',
            )}
          >
            {w}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`b-${idx}`} className="aspect-square" />
          }
          const weekend = isWeekend(year, month, day)
          const outReason = outOfEmploymentReason(employee ?? undefined, year, month, day)
          if (outReason !== null) {
            const label = outReason === 'before_hire' ? '未到職' : '已離職'
            return (
              <div
                key={day}
                title={`${month} 月 ${day} 日（${label}）`}
                aria-label={`${month} 月 ${day} 日，${label}`}
                className="relative flex aspect-square flex-col items-center justify-start rounded-md border border-slate-900 bg-slate-900 p-1 text-slate-500 cursor-not-allowed select-none"
              >
                <span className="text-sm font-medium">{day}</span>
                <span className="mt-1 text-[9px] leading-none text-slate-400">{label}</span>
              </div>
            )
          }
          const designated = designatedDays.has(day)
          const special = specialDays.has(day)
          const isRun = runDays.has(day)
          return (
            <button
              key={day}
              type="button"
              onClick={() => !readOnly && onToggleDay(day)}
              disabled={readOnly}
              aria-pressed={designated || special}
              aria-label={`${month} 月 ${day} 日${
                designated
                  ? '，指定休假'
                  : special
                    ? `，${leaveInfoByDay?.[day]?.label ?? '請假'}`
                    : ''
              }`}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-start rounded-md border p-1 transition hover:border-indigo-400 hover:shadow-sm',
                weekend ? 'bg-gray-50' : 'bg-white',
                designated && 'border-red-300 bg-red-50',
                special && 'border-purple-300 bg-purple-50',
              )}
            >
              <span
                className={cn(
                  'text-sm font-medium',
                  weekend ? 'text-red-500' : 'text-gray-700',
                )}
              >
                {day}
              </span>
              <div className="mt-0.5 flex flex-col items-center gap-0.5">
                {designated && (
                  <span className="flex items-center gap-0.5 text-[9px] leading-none text-red-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    指定
                  </span>
                )}
                {special && (
                  <span
                    className="flex items-center gap-0.5 text-[9px] leading-none"
                    style={{ color: leaveInfoByDay?.[day]?.text ?? '#7e22ce' }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: leaveInfoByDay?.[day]?.bg ?? '#a855f7' }}
                    />
                    {leaveInfoByDay?.[day]?.label ?? '請假'}
                  </span>
                )}
              </div>
              {isRun && (
                <span className="mt-0.5 text-[9px] leading-none text-orange-500">
                  連休
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
