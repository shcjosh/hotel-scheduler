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
  pendingChanges?: Record<string, { shift: string; leaveType?: string }>
  onCellClick?: (empName: string, day: number) => void
  /** 是否顯示每日覆蓋列（房務頁不需要）。 */
  showCoverage?: boolean
}

export function ScheduleTable({ view, employees, leaveTypes = [], pendingChanges = {}, onCellClick, showCoverage = true }: ScheduleTableProps) {
  const { schedule, sources, leave_details: leaveDetails, num_days: numDays, year, month } = view
  const leaveSequence = view.leave_sequence ?? {}
  const leaveBase = view.leave_base ?? {}
  const names = Object.keys(schedule)
  const empByName = new Map(employees.map((e) => [e.name, e]))
  const leaveTypeByCode = new Map(leaveTypes.map((lt) => [lt.code, lt]))

  const pad = (n: number) => String(n).padStart(2, '0')

  // 計算每位員工本月的「特 N」編號。無暫存修改時直接用後端值；
  // 有暫存修改時，以 leave_base 提供的期間起始序號即時累加（畫筆模式）。
  function sequenceForEmp(name: string): Record<number, number> {
    const hasPending = Object.keys(pendingChanges).some((k) => k.startsWith(`${name}_`))
    const saved = leaveSequence[name] ?? {}
    if (!hasPending) {
      const out: Record<number, number> = {}
      for (const [d, n] of Object.entries(saved)) out[Number(d)] = n
      return out
    }
    const bases = leaveBase[name] ?? []
    const counters: Record<string, number> = {}
    const out: Record<number, number> = {}
    const row = schedule[name] ?? []
    for (let day = 1; day <= numDays; day++) {
      const pending = pendingChanges[`${name}_${day}`]
      const shift = pending ? pending.shift : row[day - 1]
      const code = pending
        ? (pending.leaveType ?? null)
        : (leaveDetails?.[name]?.[String(day)] ?? null)
      if (shift !== 'SPECIAL' || code !== 'SPECIAL') continue
      const iso = `${year}-${pad(month)}-${pad(day)}`
      const b = bases.find((x) => x.period_start <= iso && iso <= x.period_end)
      if (!b) continue
      counters[b.period_start] = (counters[b.period_start] ?? b.base) + 1
      out[day] = counters[b.period_start]
    }
    return out
  }

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
            const seqMap = sequenceForEmp(name)
            return (
              <tr key={name} className="hover:bg-indigo-50/40">
                <th className="sticky left-0 z-10 w-32 border-b border-r border-gray-200 bg-white px-3 py-1 text-left text-sm font-medium text-gray-700">
                  <div className="flex flex-col items-start justify-center gap-0.5">
                    {emp?.tag && (
                      <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-800">
                        {emp.tag}
                      </span>
                    )}
                    {emp?.resign_date && (
                      <span
                        className="inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-gray-600"
                        title={`最後上班日 ${emp.resign_date}`}
                      >
                        離職
                      </span>
                    )}
                    <span className={cn('leading-tight', emp?.resign_date && 'text-gray-400')}>
                      {emp ? displayName(emp) : name}
                    </span>
                  </div>
                </th>
                {schedule[name].map((originalShift, d) => {
                  const day = d + 1
                  const weekend = isWeekend(year, month, day)
                  const cellKey = `${name}_${day}`
                  const pending = pendingChanges[cellKey]
                  const shift = pending ? pending.shift : originalShift
                  const source = pending ? 'manual' : sources?.[name]?.[d]
                  const leaveCode = pending
                    ? (pending.leaveType ?? null)
                    : (leaveDetails?.[name]?.[String(day)] ?? null)
                  const leaveType = leaveCode ? leaveTypeByCode.get(leaveCode) : undefined
                  const sequence = leaveCode === 'SPECIAL' ? (seqMap[day] ?? null) : null
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
                        compact
                        pending={!!pending}
                        leaveType={leaveType}
                        sequence={sequence}
                        onClick={() => onCellClick?.(name, day)}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {showCoverage && <DailyCoverage view={view} />}
      </table>
    </div>
  )
}
