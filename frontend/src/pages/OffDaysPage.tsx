import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings2, Sparkles, Loader2 } from 'lucide-react'
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
import { solveSchedule } from '../api/solve'
import { getScheduleStatus } from '../api/scheduleMeta'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import { ROLE_LABELS } from '../utils/roles'
import { displayName, avatarText, avatarColor } from '../utils/employee'
import { OffDayCalendar } from '../components/off-days/OffDayCalendar'
import { ConsecutiveOffCounter } from '../components/off-days/ConsecutiveOffCounter'
import { LeaveTypeManager } from '../components/off-days/LeaveTypeManager'
import { SolveResult } from '../components/off-days/SolveResult'
import { cn } from '../utils/cn'
import type { LeaveType, SolveResponse } from '../types'

type Mode = 'designated' | 'leave'

const BUILTIN_CODES = ['SPECIAL', 'PERSONAL', 'SICK']

export function OffDaysPage() {
  const { currentYear: year, currentMonth: month, solveMaxTime, solveEnableDBackup, setSolveEnableDBackup } = useUIStore()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('designated')
  const [leaveType, setLeaveType] = useState('SPECIAL')
  const [managerOpen, setManagerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<SolveResponse | null>(null)
  const [solveError, setSolveError] = useState<string | null>(null)

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
  const { data: statusData } = useQuery({
    queryKey: ['schedule-status', year, month],
    queryFn: () => getScheduleStatus(year, month),
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
  const builtinTypes = useMemo(
    () => BUILTIN_CODES.map((c) => leaveTypeByCode.get(c)).filter((lt): lt is LeaveType => Boolean(lt)),
    [leaveTypeByCode],
  )
  const customTypes = useMemo(
    () => leaveTypes.filter((lt) => !lt.is_builtin),
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

  async function handleSolve() {
    if (
      statusData?.status === 'published' &&
      !window.confirm('目前班表已發布，重新排班將覆蓋現有班表，確定要繼續嗎？')
    ) {
      return
    }
    setSolving(true)
    setSolveError(null)
    setResult(null)
    try {
      const r = await solveSchedule(year, month, solveMaxTime, solveEnableDBackup)
      setResult(r)
    } catch (e) {
      setSolveError(e instanceof Error ? e.message : '求解失敗')
    } finally {
      setSolving(false)
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
        <div className="flex items-center gap-3">
          {empSummary && (
            <ConsecutiveOffCounter count={empSummary.consecutive_off_count} />
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700" title="排班時啟用 D 班備援：備援日由 C+D 備援／管理職改排 D 班">
            <input
              type="checkbox"
              checked={solveEnableDBackup}
              onChange={(e) => setSolveEnableDBackup(e.target.checked)}
              className="h-4 w-4"
            />
            啟用 D 班備援邏輯
          </label>
          <button
            onClick={handleSolve}
            disabled={solving}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-6 py-2.5 text-base font-semibold text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {solving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
            {solving ? '排班中…' : '開始排班'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex items-end gap-1.5">
          {employees.map((e) => {
            const selected = selectedId === e.id || (selectedId === null && e.id === employees[0]?.id)
            return (
              <button
                key={e.id}
                onClick={() => { setSelectedId(e.id); setError(null) }}
                className="flex flex-col items-center gap-0.5"
                title={displayName(e)}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white transition',
                    avatarColor(e.id),
                    selected ? 'ring-2 ring-indigo-500 ring-offset-2' : 'opacity-70 hover:opacity-100',
                  )}
                >
                  {avatarText(e)}
                </span>
                <span className={cn('text-xs', selected ? 'font-medium text-indigo-700' : 'text-gray-500')}>
                  {e.nickname || e.name}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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
          {builtinTypes.map((lt) => {
            const active = mode === 'leave' && leaveType === lt.code
            return (
              <button
                key={lt.code}
                onClick={() => { setMode('leave'); setLeaveType(lt.code); setError(null) }}
                style={active ? { backgroundColor: lt.color_bg, color: lt.color_text } : undefined}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition',
                  active ? 'font-semibold' : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {lt.name}
              </button>
            )
          })}
          {customTypes.length > 0 && (
            <select
              value={mode === 'leave' && !BUILTIN_CODES.includes(leaveType) ? leaveType : ''}
              onChange={(e) => {
                setMode('leave')
                setLeaveType(e.target.value)
                setError(null)
              }}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                mode === 'leave' && !BUILTIN_CODES.includes(leaveType)
                  ? 'border-purple-400 bg-purple-50 text-purple-700'
                  : 'border-gray-300 bg-white text-gray-600',
              )}
            >
              <option value="" disabled>
                自訂假別…
              </option>
              {customTypes.map((lt) => (
                <option key={lt.code} value={lt.code}>{lt.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setManagerOpen(true)}
            className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50"
            title="管理/新增自訂假別"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {solveError && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{solveError}</div>
      )}
      {result && (
        <SolveResult result={result} year={year} month={month} employees={employees} onRetry={handleSolve} />
      )}

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
                    <td className="px-4 py-2 font-medium text-gray-800">{displayName(e)}</td>
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
