import { getWeekday, getWeekdayLabel, isWeekend } from '../../utils/date'
import { getShiftStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'
import type { NightEmployee } from '../../api/night'

interface NightInputTableProps {
  year: number
  month: number
  numDays: number
  nightEmployees: NightEmployee[]
  nightSchedule: Record<string, Record<string, string>>
  onEntryChange: (empId: number, day: number, value: 'D' | 'OFF' | '') => void
}

export function NightInputTable({
  year, month, numDays, nightEmployees, nightSchedule, onEntryChange,
}: NightInputTableProps) {
  if (nightEmployees.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        請先在員工管理新增大夜專職人員
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="border-collapse text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="sticky left-0 z-20 w-28 bg-gray-100 px-3 py-2 text-left">
              大夜人員 \ 日期
            </th>
            {Array.from({ length: numDays }, (_, d) => {
              const day = d + 1
              const weekend = isWeekend(year, month, day)
              return (
                <th
                  key={day}
                  className={cn(
                    'w-12 border-l border-gray-200 px-1 py-1 text-center align-top',
                    weekend && 'bg-gray-200',
                  )}
                >
                  <div className="text-sm font-semibold text-gray-800">{day}</div>
                  <div className={cn('text-[10px]', weekend ? 'text-red-500' : 'text-gray-400')}>
                    {getWeekdayLabel(getWeekday(year, month, day))}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {nightEmployees.map((emp) => (
            <tr key={emp.id} className="border-t border-gray-100">
              <th className="sticky left-0 z-10 w-28 bg-white px-3 py-1.5 text-left font-medium text-gray-700">
                {emp.nickname ? `${emp.nickname} ${emp.name}` : emp.name}
              </th>
              {Array.from({ length: numDays }, (_, d) => {
                const day = d + 1
                const weekend = isWeekend(year, month, day)
                const val = nightSchedule[String(emp.id)]?.[String(day)] ?? ''
                const style = val ? getShiftStyle(val) : null
                return (
                  <td
                    key={day}
                    className={cn(
                      'border-l border-gray-200 px-1 py-1 text-center',
                      weekend && 'bg-gray-50',
                    )}
                  >
                    <select
                      value={val}
                      onChange={(e) =>
                        onEntryChange(emp.id, day, e.target.value as 'D' | 'OFF' | '')
                      }
                      className={cn(
                        'h-8 w-10 rounded border text-center text-xs font-semibold',
                        style ? `${style.bg} ${style.text} border-transparent` : 'border-gray-300 text-gray-400',
                      )}
                    >
                      <option value="">空</option>
                      <option value="D">D</option>
                      <option value="OFF">休</option>
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
