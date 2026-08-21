import type { Employee, LeaveType, MonthScheduleView } from '../../types'
import { getWeekday, getWeekdayLabel, isWeekend } from '../../utils/date'
import { displayName } from '../../utils/employee'
import { ShiftCell } from './ShiftCell'
import { DailyCoverage } from './DailyCoverage'
import { cn } from '../../utils/cn'

interface ScheduleTableProps {
  view: MonthScheduleView
  employees: Employee[]
  leaveTypes?: LeaveType[]
  onCellClick?: (empName: string, day: number) => void
}

export function ScheduleTable({ view, employees, leaveTypes = [], onCellClick }: ScheduleTableProps) {
  const { schedule, sources, leave_details: leaveDetails, num_days: numDays, year, month } = view
  const names = Object.keys(schedule)
  const empByName = new Map(employees.map((e) => [e.name, e]))
  const leaveTypeByCode = new Map(leaveTypes.map((lt) => [lt.code, lt]))

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="sticky left-0 z-20 w-32 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left text-xs font-semibold text-gray-600">
              員工 \ 日期
            </th>
            {Array.from({ length: numDays }, (_, d) => {
              const day = d + 1
              const weekday = getWeekday(year, month, day)
              const weekend = isWeekend(year, month, day)
              return (
                <th
                  key={day}
                  className={cn(
                    'w-12 border-b border-r border-gray-200 px-1 py-1 text-center align-top',
                    weekend && 'bg-gray-200',
                  )}
                >
                  <div className="text-sm font-semibold text-gray-800">{day}</div>
                  <div className={cn('text-[10px]', weekend ? 'text-red-500' : 'text-gray-400')}>
                    {getWeekdayLabel(weekday)}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const emp = empByName.get(name)
            const locked = emp?.role === 'night'
            return (
              <tr key={name} className="hover:bg-indigo-50/40">
                <th className="sticky left-0 z-10 w-32 border-b border-r border-gray-200 bg-white px-3 py-1.5 text-left text-sm font-medium text-gray-700">
                  {emp ? displayName(emp) : name}
                </th>
                {schedule[name].map((shift, d) => {
                  const day = d + 1
                  const weekend = isWeekend(year, month, day)
                  const source = sources?.[name]?.[d]
                  const leaveCode = leaveDetails?.[name]?.[String(day)]
                  const leaveType = leaveCode ? leaveTypeByCode.get(leaveCode) : undefined
                  return (
                    <td
                      key={day}
                      className={cn(
                        'border-b border-r border-gray-200 px-1 py-1 text-center',
                        weekend && 'bg-gray-50',
                      )}
                    >
                      <ShiftCell
                        shift={shift}
                        source={source}
                        locked={locked}
                        compact
                        leaveType={leaveType}
                        onClick={() => onCellClick?.(name, day)}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        <DailyCoverage view={view} />
      </table>
    </div>
  )
}
