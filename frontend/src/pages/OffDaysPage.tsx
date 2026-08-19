import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { getEmployees } from '../api/employees'
import {
  getOffDays,
  getOffDaySummary,
  addDesignatedOff,
  removeDesignatedOff,
  addSpecialLeave,
  removeSpecialLeave,
} from '../api/offDays'
import {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
} from '../api/leaveTypes'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import { ROLE_LABELS } from '../utils/roles'
import { OffDayCalendar } from '../components/off-days/OffDayCalendar'
import { ConsecutiveOffCounter } from '../components/off-days/ConsecutiveOffCounter'
import { LeaveTypeManager } from '../components/off-days/LeaveTypeManager'
import { cn } from '../utils/cn'

type Mode = 'designated' | 'leave'

export function OffDaysPage() {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('designated')
  const [leaveType, setLeaveType] = useState('SPECIAL')
  const [managerOpen, setManagerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data: offDays } = useQuery({
    queryKey: ['off-days', year, month],
    queryFn: () => getOffDays(year, month),
  })
  const { data: summary } = useQuery({
    queryKey: ['off-day-summary', year, month],
    queryFn: () => getOffDaySummary(year, month),
  })
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => getLeaveTypes(),
  })

  const empId = selectedId ?? employees[0]?.id ?? null
  const empKey = empId !== null ? String(empId) : null
  const numDays = getMonthDays(year, month)

  const designatedSet = useMemo(
    () => new Set((empKey && offDays?.designated_off_days[empKey]) || []),
    [empKey, offDays],
  )
  const specialSet = useMemo(
    () => new Set((empKey && offDays?.special_leaves[empKey]) || []),
    [empKey, offDays],
  )
  const leaveTypeByCode = useMemo(
    () => new Map(leaveTypes.map((lt) => [lt.code, lt])),
    [leaveTypes],
  )
  const leaveInfoByDay = useMemo(() => {
    const map: Record<number, { label: string; bg: string; text: string }> = {}
    const details = empKey ? offDays?.leave_details?.[empKey] : undefined
    if (details) {
      for (const [dayStr, code] of Object.entries(details)) {
        const lt = leaveTypeByCode.get(code)
        map[Number(dayStr)] = {
          label: lt ? (lt.name.length > 2 ? lt.name.slice(0, 2) : lt.name) : '請假',
          bg: lt?.color_bg ?? '#a855f7',
          text: lt?.color_text ?? '#7e22ce',
        }
      }
    }
    return map
  }, [empKey, offDays, leaveTypeByCode])
  const runDays = useMemo(
    () => new Set((empKey && summary?.[empKey]?.consecutive_off_days) || []),
    [empKey, summary],
  )
  const empSummary = empKey ? summary?.[empKey] : undefined

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['off-days', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['off-day-summary', year, month] }),
    ])
  }

  async function toggleDay(day: number) {
    if (empId === null) return
    setError(null)
    const desig = designatedSet.has(day)
    const spec = specialSet.has(day)
    try {
      if (mode === 'designated') {
        if (desig) {
          await removeDesignatedOff(empId, year, month, day)
        } else if (spec) {
          setError('該日已為請假')
          return
        } else {
          await addDesignatedOff(empId, year, month, day)
        }
      } else {
        if (spec) {
          await removeSpecialLeave(empId, year, month, day)
        } else if (desig) {
          setError('該日已為指定休假')
          return
        } else {
          await addSpecialLeave(empId, year, month, day, leaveType)
        }
      }
      await invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗')
    }
  }

  async function handleCreateLeaveType(name: string, color_bg: string, color_text: string) {
    await createLeaveType(name, color_bg, color_text)
    await queryClient.invalidateQueries({ queryKey: ['leave-types'] })
  }
  async function handleUpdateLeaveType(code: string, payload: { name?: string; color_bg?: string; color_text?: string }) {
    await updateLeaveType(code, payload)
    await queryClient.invalidateQueries({ queryKey: ['leave-types'] })
    await queryClient.invalidateQueries({ queryKey: ['off-days', year, month] })
  }
  async function handleDeleteLeaveType(code: string) {
    await deleteLeaveType(code)
    await queryClient.invalidateQueries({ queryKey: ['leave-types'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">休假管理</h2>
          <p className="text-sm text-gray-500">
            {year} 年 {month} 月 — 指定休假與各類請假
          </p>
        </div>
        {empSummary && (
          <ConsecutiveOffCounter count={empSummary.consecutive_off_count} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={empId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{ROLE_LABELS[e.role]}）
            </option>
          ))}
        </select>
        <button
          onClick={() => { setMode('designated'); setError(null) }}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition',
            mode === 'designated'
              ? 'bg-red-500 text-white'
              : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          指定休假
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={leaveType}
            onFocus={() => { setMode('leave'); setError(null) }}
            onChange={(e) => { setLeaveType(e.target.value); setMode('leave'); setError(null) }}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              mode === 'leave'
                ? 'border-purple-400 bg-purple-50 text-purple-700'
                : 'border-gray-300 bg-white text-gray-600',
            )}
          >
            {leaveTypes.map((lt) => (
              <option key={lt.code} value={lt.code}>{lt.name}</option>
            ))}
          </select>
          <button
            onClick={() => setManagerOpen(true)}
            className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50"
            title="管理/新增自訂假別"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-orange-50 px-4 py-2 text-sm text-orange-700">
          {error}
        </div>
      )}

      {empId !== null ? (
        <OffDayCalendar
          year={year}
          month={month}
          numDays={numDays}
          designatedDays={designatedSet}
          specialDays={specialSet}
          leaveInfoByDay={leaveInfoByDay}
          runDays={runDays}
          onToggleDay={toggleDay}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
          尚無員工
        </div>
      )}

      {summary && employees.length > 0 && (
        <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">員工</th>
                <th className="px-4 py-2 text-left">角色</th>
                <th className="px-4 py-2 text-right">指定休假</th>
                <th className="px-4 py-2 text-right">請假</th>
                {leaveTypes.filter((lt) => lt.code !== 'SPECIAL').map((lt) => (
                  <th key={lt.code} className="px-4 py-2 text-right">{lt.name}</th>
                ))}
                <th className="px-4 py-2 text-right">連休次數</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const s = summary[String(e.id)]
                return (
                  <tr
                    key={e.id}
                    className="border-t border-gray-100 hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">{e.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {ROLE_LABELS[e.role]}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s?.designated_count ?? 0} / 2
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s?.total_leave_days ?? 0}
                    </td>
                    {leaveTypes.filter((lt) => lt.code !== 'SPECIAL').map((lt) => (
                      <td key={lt.code} className="px-4 py-2 text-right">
                        {s?.leave_type_counts?.[lt.code] ?? 0}
                      </td>
                    ))}
                    <td className={cn('px-4 py-2 text-right', (s?.consecutive_off_count ?? 0) === 2 ? 'text-green-700' : 'text-orange-600')}>
                      {s?.consecutive_off_count ?? 0} / 2
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <LeaveTypeManager
        open={managerOpen}
        leaveTypes={leaveTypes}
        onClose={() => setManagerOpen(false)}
        onCreate={handleCreateLeaveType}
        onUpdate={handleUpdateLeaveType}
        onDelete={handleDeleteLeaveType}
      />
    </div>
  )
}
