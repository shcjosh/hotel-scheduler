import { getWeekday, isWeekend } from '../../utils/date'
import { cn } from '../../utils/cn'

interface OffDayCalendarProps {
  year: number
  month: number
  numDays: number
  designatedDays: Set<number>
  specialDays: Set<number>
  runDays: Set<number>
  onToggleDay: (day: number) => void
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export function OffDayCalendar({
  year,
  month,
  numDays,
  designatedDays,
  specialDays,
  runDays,
  onToggleDay,
}: OffDayCalendarProps) {
  const firstWeekday = getWeekday(year, month, 1)
  const leadingBlanks = (firstWeekday + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
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
          const designated = designatedDays.has(day)
          const special = specialDays.has(day)
          const isRun = runDays.has(day)
          return (
            <button
              key={day}
              onClick={() => onToggleDay(day)}
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
              <div className="mt-1 flex gap-0.5">
                {designated && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
                {special && (
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
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
