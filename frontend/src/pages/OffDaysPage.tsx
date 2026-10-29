import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Loader2, Settings2, Sparkles } from 'lucide-react'
import { getEmployees } from '../api/employees'
import {
  getOffDays,
  getOffDaySummary,
  addDesignatedOff,
  removeDesignatedOff,
  addSpecialLeave,
  removeSpecialLeave,
} from '../api/offDays'
import { getLeaveTypes } from '../api/leaveTypes'
import { solveSchedule } from '../api/solve'
import { getScheduleStatus } from '../api/scheduleMeta'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import {
  avatarColor,
  avatarText,
  displayName,
  isHousekeeping,
  isVisibleInMonth,
} from '../utils/employee'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Section } from '../components/ui/section'
import { Toolbar } from '../components/ui/toolbar'
import { Tabs } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { Drawer } from '../components/ui/drawer'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingState } from '../components/ui/loading-state'
import { OffDayCalendar } from '../components/off-days/OffDayCalendar'
import { ConsecutiveOffCounter } from '../components/off-days/ConsecutiveOffCounter'
import { SolveResult } from '../components/off-days/SolveResult'
import { AnnualLeavePanel } from '../components/off-days/AnnualLeavePanel'
import { useToast } from '../hooks/useToast'
import { cn } from '../utils/cn'
import type { LeaveType, SolveResponse } from '../types'

type Mode = 'designated' | 'leave'
type BottomTab = 'summary' | 'annual-leave'

const BUILTIN_CODES = ['SPECIAL', 'PERSONAL', 'SICK']

export function OffDaysPage() {
  const { currentYear: year, currentMonth: month, solveMaxTime, solveEnableDBackup } = useUIStore()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('designated')
  const [leaveType, setLeaveType] = useState('SPECIAL')
  const [error, setError] = useState<string | null>(null)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<SolveResponse | null>(null)
  const [solveError, setSolveError] = useState<string | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [confirmSolve, setConfirmSolve] = useState(false)
  const [bottomTab, setBottomTab] = useState<BottomTab>('summary')

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data: offDays, isLoading } = useQuery({
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

  const visibleEmployees = useMemo(
    () => employees.filter((employee) => isVisibleInMonth(employee, year, month) && !isHousekeeping(employee)),
    [employees, year, month],
  )
  const empId = selectedId ?? visibleEmployees[0]?.id ?? null
  const empKey = empId !== null ? String(empId) : null
  const selectedEmp = visibleEmployees.find((employee) => employee.id === empId) ?? null
  const numDays = getMonthDays(year, month)
  const monthStatus = statusData?.status ?? 'draft'
  const locked = monthStatus === 'locked'

  const designatedSet = useMemo(
    () => new Set((empKey && offDays?.designated_off_days[empKey]) || []),
    [empKey, offDays],
  )
  const specialSet = useMemo(
    () => new Set((empKey && offDays?.special_leaves[empKey]) || []),
    [empKey, offDays],
  )
  const leaveTypeByCode = useMemo(
    () => new Map(leaveTypes.map((leaveTypeItem) => [leaveTypeItem.code, leaveTypeItem])),
    [leaveTypes],
  )
  const builtinTypes = useMemo(
    () =>
      BUILTIN_CODES.map((code) => leaveTypeByCode.get(code)).filter(
        (item): item is LeaveType => Boolean(item),
      ),
    [leaveTypeByCode],
  )
  const customTypes = useMemo(
    () => leaveTypes.filter((leaveTypeItem) => !leaveTypeItem.is_builtin),
    [leaveTypes],
  )
  const leaveInfoByDay = useMemo(() => {
    const map: Record<number, { label: string; bg: string; text: string }> = {}
    const details = empKey ? offDays?.leave_details?.[empKey] : undefined
    if (details) {
      for (const [dayKey, code] of Object.entries(details)) {
        const leaveTypeItem = leaveTypeByCode.get(code)
        map[Number(dayKey)] = {
          label: leaveTypeItem
            ? leaveTypeItem.name.length > 2
              ? leaveTypeItem.name.slice(0, 2)
              : leaveTypeItem.name
            : '請假',
          bg: leaveTypeItem?.color_bg ?? '#a855f7',
          text: leaveTypeItem?.color_text ?? '#7e22ce',
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
      queryClient.invalidateQueries({ queryKey: ['schedule', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['validation', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['night', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['annual-leave', year, month] }),
    ])
  }

  async function toggleDay(day: number) {
    if (empId === null) return
    if (locked) {
      setError('本月班表已鎖定，請先到班表頁解鎖')
      return
    }
    setError(null)
    const designated = designatedSet.has(day)
    const special = specialSet.has(day)
    try {
      if (mode === 'designated') {
        if (designated) {
          await removeDesignatedOff(empId, year, month, day)
        } else if (special) {
          setError('該日已為請假')
          return
        } else {
          await addDesignatedOff(empId, year, month, day)
        }
      } else if (special) {
        await removeSpecialLeave(empId, year, month, day)
      } else if (designated) {
        setError('該日已為指定休假')
        return
      } else {
        await addSpecialLeave(empId, year, month, day, leaveType)
      }
      await invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗')
    }
  }

  function handleSolve() {
    if (locked) {
      setError('本月班表已鎖定，請先解鎖再重新排班')
      return
    }
    if (monthStatus === 'published') {
      setConfirmSolve(true)
      return
    }
    void runSolve()
  }

  async function runSolve() {
    setConfirmSolve(false)
    setSolving(true)
    setSolveError(null)
    setResult(null)
    try {
      const response = await solveSchedule(year, month, solveMaxTime, solveEnableDBackup)
      setResult(response)
      setResultOpen(true)
      if (response.success) {
        toast('排班完成', { description: '可在班表頁微調或直接發布' })
      } else {
        toast('排班失敗', { tone: 'error', description: response.error ?? '請看診斷說明' })
      }
      await invalidate()
    } catch (e) {
      const message = e instanceof Error ? e.message : '求解失敗'
      setSolveError(message)
      toast('排班失敗', { tone: 'error', description: message })
    } finally {
      setSolving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${year} 年 ${month} 月 休假與排班`}
        description="點月曆指定休假或請假，完成後按「開始排班」；求解參數與假別管理在排班規則頁"
        meta={empSummary && <ConsecutiveOffCounter count={empSummary.consecutive_off_count} />}
        actions={
          <>
            <Link to="/settings?tab=solve">
              <Button variant="ghost">
                <Settings2 className="mr-2 h-4 w-4" /> 求解參數
              </Button>
            </Link>
            <Button onClick={handleSolve} disabled={solving || locked}>
              {solving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {solving ? '排班中…' : '開始排班'}
            </Button>
          </>
        }
      />

      {locked && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          本月班表已鎖定，休假與排班皆為唯讀（請到班表頁解鎖）。
        </div>
      )}

      <Toolbar>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('designated')
              setError(null)
            }}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              mode === 'designated'
                ? 'bg-red-500 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            指定休假
          </button>
          {builtinTypes.map((leaveTypeItem) => {
            const active = mode === 'leave' && leaveType === leaveTypeItem.code
            return (
              <button
                key={leaveTypeItem.code}
                type="button"
                onClick={() => {
                  setMode('leave')
                  setLeaveType(leaveTypeItem.code)
                  setError(null)
                }}
                style={active ? { backgroundColor: leaveTypeItem.color_bg, color: leaveTypeItem.color_text } : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition',
                  active
                    ? 'font-semibold'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {leaveTypeItem.name}
              </button>
            )
          })}
          {customTypes.length > 0 && (
            <select
              value={mode === 'leave' && !BUILTIN_CODES.includes(leaveType) ? leaveType : ''}
              onChange={(event) => {
                setMode('leave')
                setLeaveType(event.target.value)
                setError(null)
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                自訂假別…
              </option>
              {customTypes.map((leaveTypeItem) => (
                <option key={leaveTypeItem.code} value={leaveTypeItem.code}>
                  {leaveTypeItem.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <Link to="/settings?tab=leave-types">
          <Button variant="ghost" size="sm">
            <Settings2 className="mr-1 h-3.5 w-3.5" /> 管理假別
          </Button>
        </Link>
      </Toolbar>

      {error && <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</div>}
      {solveError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{solveError}</div>}

      {isLoading ? (
        <LoadingState label="載入休假資料…" />
      ) : visibleEmployees.length === 0 ? (
        <EmptyState
          title="尚無員工"
          description="請先到員工管理新增員工（房務請用班表頁的房務分頁）"
          action={
            <Link to="/employees">
              <Button>前往員工管理</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          <Card className="h-fit overflow-hidden">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
              員工（{visibleEmployees.length}）
            </div>
            <ul className="max-h-[65vh] divide-y divide-slate-100 overflow-auto">
              {visibleEmployees.map((employee) => {
                const stats = summary?.[String(employee.id)]
                const selected = employee.id === empId
                return (
                  <li key={employee.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(employee.id)
                        setError(null)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        selected ? 'bg-brand-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                          avatarColor(employee.id),
                        )}
                      >
                        {avatarText(employee)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span
                            className={cn(
                              'truncate text-sm',
                              selected ? 'font-semibold text-brand-800' : 'text-slate-700',
                            )}
                          >
                            {displayName(employee)}
                          </span>
                          {employee.resign_date && <Badge tone="neutral">離職</Badge>}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <span>指定休 {stats?.designated_count ?? 0}/2</span>
                          <span className="text-slate-300">·</span>
                          <span>請假 {stats?.total_leave_days ?? 0}</span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={cn(
                              (stats?.consecutive_off_count ?? 0) === 2
                                ? 'text-emerald-600'
                                : 'text-amber-600',
                            )}
                          >
                            連休 {stats?.consecutive_off_count ?? 0}/2
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>

          <div className="space-y-3">
            {selectedEmp ? (
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
              <EmptyState title="請選擇員工" description="從左側選擇要設定休假的員工" />
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-4 w-6 items-center justify-center rounded bg-red-200 text-[10px] font-semibold text-red-800">
                  休
                </span>
                指定休假（每月最多 2 天）
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                連休標記：本月連續休假段
              </span>
            </div>
          </div>
        </div>
      )}

      <Section
        title="休假明細"
        actions={
          <Tabs
            ariaLabel="休假明細"
            className="border-b-0"
            items={[
              { value: 'summary', label: '本月統計' },
              { value: 'annual-leave', label: '特休紀錄' },
            ]}
            value={bottomTab}
            onChange={(next) => setBottomTab(next as BottomTab)}
          />
        }
      >
        {bottomTab === 'summary' ? (
          summary && visibleEmployees.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">員工</th>
                    <th className="px-3 py-2 text-left">角色</th>
                    <th className="px-3 py-2 text-right">指定休假</th>
                    <th className="px-3 py-2 text-right">請假</th>
                    {leaveTypes
                      .filter((leaveTypeItem) => leaveTypeItem.code !== 'SPECIAL')
                      .map((leaveTypeItem) => (
                        <th key={leaveTypeItem.code} className="px-3 py-2 text-right">
                          {leaveTypeItem.name}
                        </th>
                      ))}
                    <th className="px-3 py-2 text-right">連休次數</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((employee) => {
                    const stats = summary[String(employee.id)]
                    return (
                      <tr key={employee.id} className="border-t border-slate-100 hover:bg-brand-50/40">
                        <td className="px-3 py-2 font-medium text-slate-800">{displayName(employee)}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {employee.role === 'night'
                            ? '大夜專職'
                            : employee.role === 'manager'
                              ? '管理職'
                              : employee.role === 'cd_backup'
                                ? 'C+D 備援'
                                : '日班櫃台'}
                        </td>
                        <td className="px-3 py-2 text-right">{stats?.designated_count ?? 0} / 2</td>
                        <td className="px-3 py-2 text-right">{stats?.total_leave_days ?? 0}</td>
                        {leaveTypes
                          .filter((leaveTypeItem) => leaveTypeItem.code !== 'SPECIAL')
                          .map((leaveTypeItem) => (
                            <td key={leaveTypeItem.code} className="px-3 py-2 text-right">
                              {stats?.leave_type_counts?.[leaveTypeItem.code] ?? 0}
                            </td>
                          ))}
                        <td
                          className={cn(
                            'px-3 py-2 text-right',
                            (stats?.consecutive_off_count ?? 0) === 2
                              ? 'text-emerald-700'
                              : 'text-amber-600',
                          )}
                        >
                          {stats?.consecutive_off_count ?? 0} / 2
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="尚無休假統計" description="選擇員工並設定休假後即可看到統計" />
          )
        ) : (
          <AnnualLeavePanel employee={selectedEmp} />
        )}
      </Section>

      <Drawer
        open={resultOpen}
        title="排班結果"
        description={`${year} 年 ${month} 月`}
        onClose={() => setResultOpen(false)}
        widthClassName="max-w-3xl"
      >
        {result ? (
          <SolveResult
            result={result}
            year={year}
            month={month}
            employees={employees}
            onRetry={() => {
              setResultOpen(false)
              void runSolve()
            }}
          />
        ) : (
          <EmptyState title="尚無結果" description="按「開始排班」後結果會顯示在這裡" />
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmSolve}
        title="重新排班並覆蓋已發布班表？"
        description="目前班表已發布，重新排班會覆蓋現有班表（系統會先建立版本快照）。"
        confirmLabel="覆蓋並排班"
        loading={solving}
        onCancel={() => setConfirmSolve(false)}
        onConfirm={runSolve}
      />
    </div>
  )
}
