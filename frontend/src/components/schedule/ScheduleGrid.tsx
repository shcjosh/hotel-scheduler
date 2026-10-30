import { useMemo, useState, type KeyboardEvent, type Ref } from 'react'
import type { Employee, LeaveType, MonthScheduleView } from '../../types'
import { getWeekday, getWeekdayLabel, isWeekend } from '../../utils/date'
import type { PendingMap } from '../../utils/brush'
import { ShiftCell } from './ShiftCell'
import { DailyCoverage } from './DailyCoverage'
import { Badge } from '../ui/badge'
import { cn } from '../../utils/cn'

interface ScheduleGridProps {
  view: MonthScheduleView
  employees: Employee[]
  leaveTypes?: LeaveType[]
  pendingChanges?: PendingMap
  showCoverage?: boolean
  dense?: boolean
  locked?: boolean
  fullscreen?: boolean
  containerRef?: Ref<HTMLDivElement>
  isSelected?: (empName: string, day: number) => boolean
  onCellClick?: (empName: string, day: number) => void
  onCellPointerDown?: (empName: string, day: number) => void
  onCellPointerEnter?: (empName: string, day: number) => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function ScheduleGrid({
  view,
  employees,
  leaveTypes = [],
  pendingChanges = {},
  showCoverage = true,
  dense = false,
  locked = false,
  fullscreen = false,
  containerRef,
  isSelected,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onKeyDown,
}: ScheduleGridProps) {
  const { schedule, sources, leave_details: leaveDetails, num_days: numDays, year, month } = view
  const leaveSequence = view.leave_sequence ?? {}
  const leaveBase = view.leave_base ?? {}
  const names = useMemo(() => Object.keys(schedule), [schedule])
  const empByName = useMemo(() => new Map(employees.map((e) => [e.name, e])), [employees])
  const leaveTypeByCode = useMemo(() => new Map(leaveTypes.map((lt) => [lt.code, lt])), [leaveTypes])
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day

  const pad = (n: number) => String(n).padStart(2, '0')

  // 每位員工本月的「特 N」編號。無暫存修改時直接用後端值；
  // 有暫存修改時，以 leave_base 提供的期間起始序號即時累加（畫筆模式）。
  function sequenceForEmp(name: string): Record<number, number> {
    const hasPending = Object.keys(pendingChanges).some((key) => key.startsWith(`${name}_`))
    const saved = leaveSequence[name] ?? {}
    if (!hasPending) {
      const out: Record<number, number> = {}
      for (const [day, n] of Object.entries(saved)) out[Number(day)] = n
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
      const base = bases.find((item) => item.period_start <= iso && iso <= item.period_end)
      if (!base) continue
      counters[base.period_start] = (counters[base.period_start] ?? base.base) + 1
      out[day] = counters[base.period_start]
    }
    return out
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="grid"
      aria-label={`${year} 年 ${month} 月班表（方向鍵移動，Enter 編輯）`}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // 點擊表格空白處時把焦點留在表格，方向鍵才能直接使用
        if (event.target === event.currentTarget) event.currentTarget.focus()
      }}
      className={cn(
        'hs-scroll overflow-auto rounded-lg border border-slate-200 bg-white shadow-card outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        fullscreen ? 'h-full max-h-none' : 'max-h-[68vh]',
      )}
    >
      <table className="w-max border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-100">
            <th className="sticky left-0 z-30 w-28 border-b border-r border-slate-200 bg-slate-100 px-2 py-1.5 text-left text-xs font-semibold text-slate-600">
              員工 \ 日期
            </th>
            {Array.from({ length: numDays }, (_, d) => {
              const day = d + 1
              const weekday = getWeekday(year, month, day)
              const weekend = isWeekend(year, month, day)
              const monday = weekday === 1
              return (
                <th
                  key={day}
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className={cn(
                    'w-10 border-b border-r border-slate-200 px-1 py-1 text-center align-top',
                    weekend && 'bg-slate-200/80',
                    monday && 'border-l-2 border-l-slate-300',
                    hoveredDay === day && !weekend && 'bg-brand-50',
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                      isToday(day) ? 'bg-brand-600 text-white' : 'text-slate-800',
                    )}
                  >
                    {day}
                  </div>
                  <div className={cn('text-[10px]', weekend ? 'text-red-500' : 'text-slate-400')}>
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
              <tr key={name} className="hover:bg-brand-50/40">
                <th className="sticky left-0 z-10 w-32 border-b border-r border-slate-200 bg-white px-2 py-1 text-left text-sm font-medium text-slate-700">
                  <div className="flex flex-col items-start justify-center gap-0.5">
                    {emp?.tag && <Badge tone="warning">{emp.tag}</Badge>}
                    {emp?.resign_date && (
                      <span title={`最後上班日 ${emp.resign_date}`}>
                        <Badge>離職</Badge>
                      </span>
                    )}
                    <span
                      className={cn(
                        'leading-tight',
                        emp?.resign_date && 'text-slate-400',
                      )}
                    >
                      {emp ? emp.name : name}
                    </span>
                    {emp?.nickname && (
                      <span className="text-[10px] leading-tight text-slate-400">
                        {emp.nickname}
                      </span>
                    )}
                  </div>
                </th>
                {schedule[name].map((originalShift, d) => {
                  const day = d + 1
                  const weekend = isWeekend(year, month, day)
                  const monday = getWeekday(year, month, day) === 1
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
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={cn(
                        'border-b border-r border-slate-200 px-0.5 py-0.5 text-center',
                        weekend && 'bg-slate-50',
                        monday && 'border-l-2 border-l-slate-300',
                        hoveredDay === day && !weekend && 'bg-brand-50/50',
                      )}
                    >
                      <ShiftCell
                        shift={shift}
                        source={source}
                        dense={dense}
                        pending={!!pending}
                        selected={isSelected?.(name, day)}
                        disabled={locked}
                        leaveType={leaveType}
                        sequence={sequence}
                        onClick={() => onCellClick?.(name, day)}
                        onPointerDown={() => onCellPointerDown?.(name, day)}
                        onPointerEnter={() => onCellPointerEnter?.(name, day)}
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
