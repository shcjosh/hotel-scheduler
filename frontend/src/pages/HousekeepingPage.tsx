import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, Lock, Paintbrush, Trash2, Unlock, Users, X, CheckCheck } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getEmployees } from '../api/employees'
import { getSchedule, updateScheduleEntry, clearSchedule } from '../api/schedules'
import { getLeaveTypes } from '../api/leaveTypes'
import { getScheduleStatus, setScheduleStatus } from '../api/scheduleMeta'
import { ScheduleTable } from '../components/schedule/ScheduleTable'
import { AnnualLeavePanel } from '../components/off-days/AnnualLeavePanel'
import { Button } from '../components/ui/button'
import {
  avatarColor,
  avatarText,
  displayName,
  isHousekeeping,
  isVisibleInMonth,
} from '../utils/employee'
import { getShiftStyle } from '../utils/shift'
import { cn } from '../utils/cn'
import type { ScheduleStatus } from '../types'

const LT_PREFIX = 'LT:'
const BRUSH_SHIFTS = ['A', 'OFF'] as const

const STATUS_META: Record<ScheduleStatus, { label: string; dot: string; cls: string }> = {
  draft: { label: '草稿中', dot: '🟡', cls: 'bg-yellow-100 text-yellow-700' },
  published: { label: '已發布', dot: '🟢', cls: 'bg-green-100 text-green-700' },
  locked: { label: '已鎖定', dot: '🔒', cls: 'bg-gray-200 text-gray-700' },
}

export function HousekeepingPage() {
  const { currentYear, currentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const [selectedTool, setSelectedTool] = useState<string>('A')
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null)
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, { shift: string; leaveType?: string }>
  >({})
  const [saving, setSaving] = useState(false)

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['housekeeping-schedule', currentYear, currentMonth],
    queryFn: () => getSchedule(currentYear, currentMonth, 'housekeeping'),
  })
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => getLeaveTypes(),
  })
  const { data: statusData } = useQuery({
    queryKey: ['schedule-status', currentYear, currentMonth],
    queryFn: () => getScheduleStatus(currentYear, currentMonth),
  })

  const status = statusData?.status ?? data?.status ?? 'draft'
  const locked = status === 'locked'
  const hkEmployees = employees.filter(
    (e) => isHousekeeping(e) && isVisibleInMonth(e, currentYear, currentMonth),
  )
  const selectedEmp =
    hkEmployees.find((e) => e.id === selectedEmpId) ?? hkEmployees[0] ?? null

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['housekeeping-schedule', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['schedule-status', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['annual-leave', currentYear, currentMonth] })
  }

  function handleCellClick(empName: string, day: number) {
    if (locked) return
    const key = `${empName}_${day}`
    const originalShift = data?.schedule[empName]?.[day - 1]
    const originalLeaveCode = data?.leave_details?.[empName]?.[String(day)]

    const isLT = selectedTool.startsWith(LT_PREFIX)
    const targetShift = isLT ? 'SPECIAL' : selectedTool
    const targetLeaveType = isLT ? selectedTool.slice(LT_PREFIX.length) : undefined

    if (originalShift === targetShift && (!isLT || originalLeaveCode === targetLeaveType)) {
      setPendingChanges((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      setPendingChanges((prev) => ({
        ...prev,
        [key]: { shift: targetShift, leaveType: targetLeaveType },
      }))
    }
  }

  async function handleApply() {
    const keys = Object.keys(pendingChanges)
    if (keys.length === 0) return
    setSaving(true)
    try {
      for (const key of keys) {
        const [empName, dayStr] = key.split('_')
        const emp = hkEmployees.find((e) => e.name === empName)
        if (!emp) continue
        await updateScheduleEntry(
          emp.id,
          currentYear,
          currentMonth,
          Number(dayStr),
          pendingChanges[key].shift,
          pendingChanges[key].leaveType,
        )
      }
      setPendingChanges({})
      invalidate()
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (window.confirm(`確定要清空 ${currentYear} 年 ${currentMonth} 月的房務班表嗎？（不影響櫃台班表）`)) {
      await clearSchedule(currentYear, currentMonth, 'housekeeping')
      setPendingChanges({})
      invalidate()
    }
  }

  async function handleSetStatus(next: ScheduleStatus) {
    if (next === 'locked' && !window.confirm('鎖定後該月份將唯讀，確定要鎖定嗎？')) return
    await setScheduleStatus(currentYear, currentMonth, next)
    invalidate()
  }

  const statusMeta = STATUS_META[status]
  const pendingCount = Object.keys(pendingChanges).length
  const empty = data ? !hkEmployees.length : false
  const selectedLeaveType = selectedTool.startsWith(LT_PREFIX)
    ? leaveTypes.find((lt) => lt.code === selectedTool.slice(LT_PREFIX.length))
    : undefined
  const selectedLabel =
    selectedTool === 'OFF' ? '休' : (selectedLeaveType?.name ?? selectedTool)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-800">
            {currentYear} 年 {currentMonth} 月 房務班表
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.cls}`}>
              {statusMeta.dot} {statusMeta.label}
            </span>
          </h2>
          <p className="text-sm text-gray-500">
            房務手動排班（A 09:00-18:00，含 1 小時用餐）；與櫃台班表互不干涉、不做規則檢測
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'draft' && (
            <Button onClick={() => handleSetStatus('published')}>發布班表</Button>
          )}
          {(status === 'draft' || status === 'published') && (
            <Button variant="outline" onClick={() => handleSetStatus('locked')} className="text-gray-700">
              <Lock className="mr-2 h-4 w-4" /> 鎖定
            </Button>
          )}
          {locked && (
            <Button variant="outline" onClick={() => handleSetStatus('draft')} className="text-gray-700">
              <Unlock className="mr-2 h-4 w-4" /> 解鎖
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={status === 'locked'}
            title={status === 'locked' ? '已鎖定月份請先解鎖才能清空' : undefined}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" /> 清空當月房務
          </Button>
        </div>
      </div>

      {!isLoading && !isError && !empty && !locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-blue-900">
              <Paintbrush className="h-3.5 w-3.5" /> 快捷畫筆：
            </span>
            {BRUSH_SHIFTS.map((s) => {
              const style = getShiftStyle(s)
              const active = selectedTool === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedTool(s)}
                  className={cn(
                    'inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-bold transition',
                    style.bg,
                    style.text,
                    active ? 'ring-2 ring-blue-600 ring-offset-1 scale-105 shadow-sm' : 'opacity-80 hover:opacity-100',
                  )}
                  title={s === 'A' ? '房務 A（09:00-18:00）' : '休'}
                >
                  {style.label}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-blue-200" />
            {leaveTypes.map((lt) => {
              const active = selectedTool === `${LT_PREFIX}${lt.code}`
              return (
                <button
                  key={lt.code}
                  type="button"
                  onClick={() => setSelectedTool(`${LT_PREFIX}${lt.code}`)}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded px-2.5 text-xs font-bold transition',
                    active ? 'ring-2 ring-blue-600 ring-offset-1 scale-105 shadow-sm' : 'opacity-80 hover:opacity-100',
                  )}
                  style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
                >
                  {lt.name}
                </button>
              )
            })}
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-900">已暫存 {pendingCount} 處修改</span>
              <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => setPendingChanges({})}>
                放棄
              </Button>
              <Button className="px-3 py-1 text-xs" onClick={handleApply} disabled={saving}>
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> {saving ? '套用中…' : '套用'}
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">載入中…</div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-600">
          載入失敗：{error instanceof Error ? error.message : '未知錯誤'}
        </div>
      )}

      {!isLoading && !isError && hkEmployees.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <CalendarX className="mb-3 h-12 w-12 text-gray-300" />
          <p className="mb-1 text-lg font-medium text-gray-700">尚無房務人員</p>
          <p className="mb-4 text-sm text-gray-500">請先到員工管理新增角色為「房務」的員工</p>
          <Link to="/employees"><Button><Users className="mr-2 h-4 w-4" />前往員工管理</Button></Link>
        </div>
      )}

      {!isLoading && !isError && data && hkEmployees.length > 0 && (
        <>
          <ScheduleTable
            view={data}
            employees={employees}
            leaveTypes={leaveTypes}
            pendingChanges={pendingChanges}
            onCellClick={handleCellClick}
            showCoverage={false}
          />
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-blue-100 text-center text-[8px] leading-3 text-blue-800">A</span>
              房務 A（09:00-18:00）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-red-200 text-center text-[8px] leading-3 text-red-800">休</span>
              休
            </span>
            {leaveTypes.map((lt) => (
              <span key={lt.code} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 min-w-3 rounded px-0.5 text-center text-[8px] leading-3"
                  style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
                >
                  {lt.name.length > 2 ? lt.name.slice(0, 2) : lt.name}
                </span>
                {lt.name}
              </span>
            ))}
            {selectedTool && (
              <span className="flex items-center gap-0.5 text-blue-700">
                <X className="h-3 w-3" /> 目前畫筆：{selectedLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span className="text-xs font-medium text-gray-500">特休紀錄對象：</span>
            {hkEmployees.map((e) => {
              const selected = selectedEmp?.id === e.id
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEmpId(e.id)}
                  className="flex flex-col items-center gap-0.5"
                  title={displayName(e)}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white transition',
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

          <AnnualLeavePanel employee={selectedEmp} />
        </>
      )}
    </div>
  )
}
