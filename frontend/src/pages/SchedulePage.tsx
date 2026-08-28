import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, FileDown, History, Lock, RefreshCw, Sparkles, Trash2, Unlock, Send, Paintbrush, CheckCheck, X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getEmployees } from '../api/employees'
import { getSchedule, getValidationReport, validateCell, updateScheduleEntry, clearSchedule } from '../api/schedules'
import { getLeaveTypes } from '../api/leaveTypes'
import { getSettings } from '../api/settings'
import { printSchedule } from '../utils/printSchedule'
import {
  setScheduleStatus,
  getSnapshots,
  restoreSnapshot,
  diffSnapshots,
} from '../api/scheduleMeta'
import {
  getSupportRequests,
  createSupportRequest,
  updateSupportRequest,
  deleteSupportRequest,
} from '../api/support'
import { ScheduleTable } from '../components/schedule/ScheduleTable'
import { ShiftLegend } from '../components/schedule/ShiftLegend'
import { CellEditModal } from '../components/schedule/CellEditModal'
import { BatchApplyModal, type PendingCellChange } from '../components/schedule/BatchApplyModal'
import { AdjustScheduleModal } from '../components/schedule/AdjustScheduleModal'
import { ValidationReportPanel } from '../components/schedule/ValidationReport'
import { SupportRequestPanel } from '../components/support/SupportRequestPanel'
import { VersionHistoryDrawer } from '../components/schedule/VersionHistoryDrawer'
import { Button } from '../components/ui/button'
import { displayName } from '../utils/employee'
import { getShiftStyle } from '../utils/shift'
import { cn } from '../utils/cn'
import type { ScheduleStatus } from '../types'
import type { CellViolation } from '../api/schedules'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) => row.some((s) => s && s !== 'OFF' && s !== 'EMPTY'))
}

const STATUS_META: Record<ScheduleStatus, { label: string; dot: string; cls: string }> = {
  draft: { label: '草稿中', dot: '🟡', cls: 'bg-yellow-100 text-yellow-700' },
  published: { label: '已發布', dot: '🟢', cls: 'bg-green-100 text-green-700' },
  locked: { label: '已鎖定', dot: '🔒', cls: 'bg-gray-200 text-gray-700' },
}

const LT_PREFIX = 'LT:'

export function SchedulePage() {
  const { currentYear, currentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ empName: string; day: number } | null>(null)
  const [versionOpen, setVersionOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  // 快速連選／畫筆模式
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Record<string, { shift: string; leaveType?: string }>>({})
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchChecking, setBatchChecking] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchViolations, setBatchViolations] = useState<CellViolation[]>([])
  const [batchWarnings, setBatchWarnings] = useState<CellViolation[]>([])

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['schedule', currentYear, currentMonth],
    queryFn: () => getSchedule(currentYear, currentMonth),
  })
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => getLeaveTypes(),
  })
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(),
  })
  const hotelName = settings?.hotel_name ?? '清翼居府中館'
  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', currentYear, currentMonth],
    queryFn: () => getSnapshots(currentYear, currentMonth),
  })
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['validation', currentYear, currentMonth],
    queryFn: () => getValidationReport(currentYear, currentMonth),
  })
  const { data: supportReqs = [] } = useQuery({
    queryKey: ['support-requests', currentYear, currentMonth],
    queryFn: () => getSupportRequests(currentYear, currentMonth),
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['schedule', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['validation', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['snapshots', currentYear, currentMonth] })
  }

  const supportMut = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['support-requests', currentYear, currentMonth] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ empId, day, shift, leaveType, reason }: { empId: number; day: number; shift: string; leaveType?: string; reason?: string }) =>
      updateScheduleEntry(empId, currentYear, currentMonth, day, shift, leaveType, reason),
    onSuccess: () => {
      invalidateAll()
    },
  })

  const clearMut = useMutation({
    mutationFn: () => clearSchedule(currentYear, currentMonth),
    onSuccess: () => {
      setPendingChanges({})
      invalidateAll()
    },
  })

  const statusMut = useMutation({
    mutationFn: (status: ScheduleStatus) => setScheduleStatus(currentYear, currentMonth, status),
    onSuccess: () => invalidateAll(),
  })

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreSnapshot(id),
    onSuccess: () => {
      setPendingChanges({})
      invalidateAll()
    },
  })

  function handleClear() {
    if (window.confirm(`確定要清空 ${currentYear} 年 ${currentMonth} 月的排班嗎？（保留大夜手動輸入）`)) {
      clearMut.mutate()
    }
  }

  function handlePrint() {
    if (data) printSchedule(data, employees, leaveTypes, hotelName)
  }

  function handleSetStatus(status: ScheduleStatus) {
    if (status === 'locked' && !window.confirm('鎖定後該月份將唯讀，確定要鎖定嗎？')) return
    statusMut.mutate(status)
  }

  const empty = data ? !hasRealData(data.schedule) : false
  const editingEmp = editing ? employees.find((e) => e.name === editing.empName) : null
  const editingShift = editing && data ? data.schedule[editing.empName][editing.day - 1] : ''
  const editingLeaveCode = editing && data ? data.leave_details?.[editing.empName]?.[String(editing.day)] ?? null : null
  const status = data?.status ?? 'draft'
  const statusMeta = STATUS_META[status]

  // 處理點擊格子
  function handleCellClick(empName: string, day: number) {
    if (status === 'locked') return
    const emp = employees.find((e) => e.name === empName)
    if (!emp) return

    if (selectedTool) {
      // 快速連選模式
      const key = `${empName}_${day}`
      const originalShift = data?.schedule[empName]?.[day - 1]
      const originalLeaveCode = data?.leave_details?.[empName]?.[String(day)]

      const isLT = selectedTool.startsWith(LT_PREFIX)
      const targetShift = isLT ? 'SPECIAL' : selectedTool
      const targetLeaveType = isLT ? selectedTool.slice(LT_PREFIX.length) : undefined

      // 大夜格位只能 D/OFF；非大夜不可排 D（D 班備援由系統自動指派）
      if (emp.role === 'night') {
        if (targetShift !== 'D' && targetShift !== 'OFF') return
      } else if (targetShift === 'D') {
        return
      }

      // 如果點擊的值跟原始資料相同，則清除暫存
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
    } else {
      // 單格編輯彈窗
      setEditing({ empName, day })
    }
  }

  // 批次檢查並開啟確認彈窗
  async function handleOpenBatchModal() {
    const changeKeys = Object.keys(pendingChanges)
    if (changeKeys.length === 0 || !data) return

    setBatchModalOpen(true)
    setBatchChecking(true)
    setBatchViolations([])
    setBatchWarnings([])

    try {
      const allViolations: CellViolation[] = []
      const allWarnings: CellViolation[] = []
      for (const key of changeKeys) {
        const [empName, dayStr] = key.split('_')
        const day = Number(dayStr)
        const emp = employees.find((e) => e.name === empName)
        if (!emp) continue
        const item = pendingChanges[key]
        const r = await validateCell(emp.id, currentYear, currentMonth, day, item.shift)
        for (const v of r.violations) {
          allViolations.push({ ...v, message: `${empName} (${day}號): ${v.message}` })
        }
        for (const w of r.warnings) {
          allWarnings.push({ ...w, message: `${empName} (${day}號): ${w.message}` })
        }
      }
      setBatchViolations(allViolations)
      setBatchWarnings(allWarnings)
    } catch {
      setBatchViolations([{ rule: 'ERR', severity: 'hard', message: '檢查過程發生錯誤' }])
    } finally {
      setBatchChecking(false)
    }
  }

  // 批次確認套用
  async function handleBatchConfirm(reason?: string) {
    const changeKeys = Object.keys(pendingChanges)
    if (changeKeys.length === 0) return

    setBatchSaving(true)
    try {
      for (const key of changeKeys) {
        const [empName, dayStr] = key.split('_')
        const day = Number(dayStr)
        const emp = employees.find((e) => e.name === empName)
        if (!emp) continue
        const item = pendingChanges[key]
        await updateScheduleEntry(
          emp.id,
          currentYear,
          currentMonth,
          day,
          item.shift,
          item.leaveType,
          reason,
        )
      }
      setPendingChanges({})
      setBatchModalOpen(false)
      invalidateAll()
    } finally {
      setBatchSaving(false)
    }
  }

  const pendingChangeList: PendingCellChange[] = Object.entries(pendingChanges).map(([key, val]) => {
    const [empName, dayStr] = key.split('_')
    const day = Number(dayStr)
    const prevShift = data?.schedule[empName]?.[day - 1] ?? ''
    return {
      empName,
      day,
      shift: val.shift === 'SPECIAL' && val.leaveType ? `請假(${val.leaveType})` : val.shift,
      leaveType: val.leaveType,
      prevShift,
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-800">
            {currentYear} 年 {currentMonth} 月 排班表
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.cls}`}>
              {statusMeta.dot} {statusMeta.label}
            </span>
          </h2>
          <p className="text-sm text-gray-500">
            {selectedTool ? '畫筆連選模式：單擊格位即可快速改班' : '點擊格位可手動微調班次，或選取下方畫筆快速連改'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setVersionOpen(true)}
            className="text-gray-700"
          >
            <History className="mr-2 h-4 w-4" />
            版本歷史
          </Button>
          {!empty && data && (
            <Button variant="outline" onClick={handlePrint} className="text-gray-700">
              <FileDown className="mr-2 h-4 w-4" />
              匯出 PDF
            </Button>
          )}
          {status === 'draft' && (
            <Button onClick={() => handleSetStatus('published')}>
              <Send className="mr-2 h-4 w-4" /> 發布班表
            </Button>
          )}
          {(status === 'draft' || status === 'published') && (
            <Button variant="outline" onClick={() => handleSetStatus('locked')} className="text-gray-700">
              <Lock className="mr-2 h-4 w-4" /> 鎖定
            </Button>
          )}
          {status === 'locked' && (
            <Button variant="outline" onClick={() => handleSetStatus('draft')} className="text-gray-700">
              <Unlock className="mr-2 h-4 w-4" /> 解鎖
            </Button>
          )}
          {!empty && data && status !== 'locked' && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)} className="text-gray-700">
              <RefreshCw className="mr-2 h-4 w-4" /> 臨時異動
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={clearMut.isPending}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空當月排班
          </Button>
        </div>
      </div>

      {/* 快速手動調整工具列 */}
      {!isLoading && !isError && !empty && status !== 'locked' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-blue-900">
              <Paintbrush className="h-3.5 w-3.5" /> 快捷畫筆：
            </span>
            {['A', 'B', 'C', 'D', 'M', 'OFF'].map((s) => {
              const style = getShiftStyle(s)
              const active = selectedTool === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedTool((cur) => (cur === s ? null : s))}
                  className={cn(
                    'inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-bold transition',
                    style.bg,
                    style.text,
                    active ? 'ring-2 ring-blue-600 ring-offset-1 scale-105 shadow-sm' : 'opacity-80 hover:opacity-100',
                  )}
                  title={s === 'D' ? '僅可塗在大夜專職格位' : undefined}
                >
                  {style.label}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-blue-200" />
            {['A1', 'C1', 'D1'].map((s) => {
              const style = getShiftStyle(s)
              const active = selectedTool === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedTool((cur) => (cur === s ? null : s))}
                  className={cn(
                    'inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-bold transition',
                    style.bg,
                    style.text,
                    active ? 'ring-2 ring-amber-600 ring-offset-1 scale-105 shadow-sm' : 'opacity-80 hover:opacity-100',
                  )}
                  title="二館支援班次"
                >
                  {style.label}
                </button>
              )
            })}
            {leaveTypes.slice(0, 3).map((lt) => {
              const active = selectedTool === `${LT_PREFIX}${lt.code}`
              return (
                <button
                  key={lt.code}
                  type="button"
                  onClick={() => setSelectedTool((cur) => (cur === `${LT_PREFIX}${lt.code}` ? null : `${LT_PREFIX}${lt.code}`))}
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
            {selectedTool && (
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="flex items-center gap-0.5 rounded px-2 py-1 text-xs text-gray-500 hover:bg-blue-100 hover:text-gray-700"
              >
                <X className="h-3 w-3" /> 取消畫筆
              </button>
            )}
          </div>

          {pendingChangeList.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-900">
                已暫存 {pendingChangeList.length} 處修改
              </span>
              <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => setPendingChanges({})}>
                放棄
              </Button>
              <Button className="px-3 py-1 text-xs" onClick={handleOpenBatchModal}>
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> 檢查並套用
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

      {!isLoading && !isError && empty && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <CalendarX className="mb-3 h-12 w-12 text-gray-300" />
          <p className="mb-1 text-lg font-medium text-gray-700">尚無排班資料</p>
          <p className="mb-4 text-sm text-gray-500">請先執行排班引擎產生 {currentMonth} 月班表</p>
          <Link to="/off-days"><Button><Sparkles className="mr-2 h-4 w-4" />前往排班</Button></Link>
        </div>
      )}

      {!isLoading && !isError && !empty && data && (
        <>
          <ScheduleTable
            view={data}
            employees={employees}
            leaveTypes={leaveTypes}
            pendingChanges={pendingChanges}
            onCellClick={handleCellClick}
          />
          <ShiftLegend leaveTypes={leaveTypes} />
          <ValidationReportPanel
            report={report}
            isLoading={reportLoading}
            onRefresh={() => invalidateAll()}
            onJumpTo={(empName, day) => setEditing({ empName, day })}
            employees={employees}
          />
          <SupportRequestPanel
            requests={supportReqs}
            numDays={data.num_days}
            month={currentMonth}
            onAdd={(d, s, r) => supportMut.mutateAsync(() => createSupportRequest(currentYear, currentMonth, d, s, r))}
            onUpdate={(id, st, res) => supportMut.mutateAsync(() => updateSupportRequest(id, st, res))}
            onRemove={(id) => supportMut.mutateAsync(() => deleteSupportRequest(id))}
          />
        </>
      )}

      {editing && editingEmp && (
        <CellEditModal
          open={true}
          employeeName={displayName(editingEmp)}
          day={editing.day}
          month={currentMonth}
          currentShift={editingShift}
          currentLeaveTypeCode={editingLeaveCode}
          availableShifts={
            editingEmp.role === 'night'
              ? editingEmp.available_shifts
              : editingEmp.available_shifts.filter((s) => s !== 'D')
          }
          leaveTypes={editingEmp.role === 'night' ? [] : leaveTypes}
          isPublished={status === 'published'}
          onClose={() => setEditing(null)}
          onValidate={(newShift) =>
            validateCell(editingEmp.id, currentYear, currentMonth, editing.day, newShift)
          }
          onConfirm={async (newShift, leaveType, reason) => {
            await updateMut.mutateAsync({ empId: editingEmp.id, day: editing.day, shift: newShift, leaveType, reason })
          }}
        />
      )}

      {batchModalOpen && (
        <BatchApplyModal
          open={batchModalOpen}
          changes={pendingChangeList}
          isPublished={status === 'published'}
          violations={batchViolations}
          warnings={batchWarnings}
          isChecking={batchChecking}
          isSaving={batchSaving}
          onClose={() => setBatchModalOpen(false)}
          onConfirm={handleBatchConfirm}
        />
      )}

      <VersionHistoryDrawer
        open={versionOpen}
        snapshots={snapshots}
        employees={employees}
        onClose={() => setVersionOpen(false)}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onDiff={diffSnapshots}
      />

      {adjustOpen && data && (
        <AdjustScheduleModal
          year={currentYear}
          month={currentMonth}
          employees={employees}
          leaveTypes={leaveTypes}
          numDays={data.num_days}
          onClose={() => setAdjustOpen(false)}
          onApplied={() => invalidateAll()}
        />
      )}
    </div>
  )
}

