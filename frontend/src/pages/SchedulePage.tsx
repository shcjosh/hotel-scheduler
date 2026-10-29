import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, CircleAlert, FileDown, History, Lock, RefreshCw, Sparkles, Trash2, Unlock, Send, Paintbrush, CheckCheck, X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getEmployees } from '../api/employees'
import { getSchedule, getValidationReport, validateCell, updateScheduleEntry, clearSchedule } from '../api/schedules'
import { getLeaveTypes } from '../api/leaveTypes'
import { getSettings } from '../api/settings'
import { PrintPreviewModal } from '../components/schedule/PrintPreviewModal'
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
import {
  getNightSchedule,
  addBackupRequest,
  removeBackupRequest,
  clearNightSchedule,
} from '../api/night'
import { ScheduleTable } from '../components/schedule/ScheduleTable'
import { ShiftLegend } from '../components/schedule/ShiftLegend'
import { CellEditModal } from '../components/schedule/CellEditModal'
import { BatchApplyModal, type PendingCellChange } from '../components/schedule/BatchApplyModal'
import { AdjustScheduleModal } from '../components/schedule/AdjustScheduleModal'
import { ValidationReportPanel } from '../components/schedule/ValidationReport'
import { SupportRequestPanel } from '../components/support/SupportRequestPanel'
import { DBackupRequestPanel } from '../components/night/DBackupRequestPanel'
import { VersionHistoryDrawer } from '../components/schedule/VersionHistoryDrawer'
import { Button } from '../components/ui/button'
import { PageHeader } from '../components/ui/page-header'
import { StatusPill } from '../components/ui/status-pill'
import { Toolbar } from '../components/ui/toolbar'
import { LoadingState } from '../components/ui/loading-state'
import { EmptyState } from '../components/ui/empty-state'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { displayName } from '../utils/employee'
import { getShiftStyle } from '../utils/shift'
import { cn } from '../utils/cn'
import type { ScheduleStatus } from '../types'
import type { CellViolation } from '../api/schedules'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) => row.some((s) => s && s !== 'OFF' && s !== 'EMPTY'))
}

const LT_PREFIX = 'LT:'

export function SchedulePage() {
  const { currentYear, currentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ empName: string; day: number } | null>(null)
  const [versionOpen, setVersionOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'clear' | 'clear-night' | 'lock' | null>(null)

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
  const userName = settings?.user_name ?? 'Josh Wang'
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
  const { data: night } = useQuery({
    queryKey: ['night', currentYear, currentMonth],
    queryFn: () => getNightSchedule(currentYear, currentMonth),
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['schedule', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['validation', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['snapshots', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['night', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['off-days', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['off-day-summary', currentYear, currentMonth] })
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

  const backupAddMut = useMutation({
    mutationFn: (day: number) => addBackupRequest(currentYear, currentMonth, day),
    onSuccess: () => invalidateAll(),
  })
  const backupRemoveMut = useMutation({
    mutationFn: (id: number) => removeBackupRequest(id),
    onSuccess: () => invalidateAll(),
  })
  const clearNightMut = useMutation({
    mutationFn: () => clearNightSchedule(currentYear, currentMonth),
    onSuccess: () => {
      setPendingChanges({})
      invalidateAll()
    },
  })

  function handleClearNight() {
    setConfirmKind('clear-night')
  }

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
    setConfirmKind('clear')
  }

  function handleSetStatus(status: ScheduleStatus) {
    if (status === 'locked') {
      setConfirmKind('lock')
      return
    }
    statusMut.mutate(status)
  }

  function handleConfirmAction() {
    const done = () => setConfirmKind(null)
    if (confirmKind === 'clear') clearMut.mutate(undefined, { onSettled: done })
    else if (confirmKind === 'clear-night') clearNightMut.mutate(undefined, { onSettled: done })
    else if (confirmKind === 'lock') statusMut.mutate('locked', { onSettled: done })
  }

  const confirmContent: Record<
    'clear' | 'clear-night' | 'lock',
    { title: string; description: string; confirmLabel: string }
  > = {
    clear: {
      title: `清空 ${currentYear} 年 ${currentMonth} 月排班？`,
      description:
        '將刪除本月所有班表（手動輸入的大夜會保留），同時清除本月支援請求，班表狀態回到草稿。此動作無法復原。',
      confirmLabel: '清空排班',
    },
    'clear-night': {
      title: `清空 ${currentYear} 年 ${currentMonth} 月大夜排班？`,
      description: '將清除本月所有大夜格位與大夜假別紀錄，櫃台白天班不受影響。此動作無法復原。',
      confirmLabel: '清空大夜',
    },
    lock: {
      title: `鎖定 ${currentYear} 年 ${currentMonth} 月班表？`,
      description: '鎖定後本月班表、休假與大夜皆為唯讀，需先解鎖才能修改。',
      confirmLabel: '鎖定',
    },
  }

  const empty = data ? !hasRealData(data.schedule) : false
  const editingEmp = editing ? employees.find((e) => e.name === editing.empName) : null
  const editingShift = editing && data ? data.schedule[editing.empName][editing.day - 1] : ''
  const editingLeaveCode = editing && data ? data.leave_details?.[editing.empName]?.[String(editing.day)] ?? null : null
  const status = data?.status ?? 'draft'

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

      // 二館支援只能 A1/C1/D1；大夜格位只能 D/OFF；非大夜不可排 D（備援由系統指派）
      if (emp.tag) {
        if (isLT || !['A1', 'C1', 'D1'].includes(targetShift)) return
      } else if (emp.role === 'night') {
        // 大夜可排 D/OFF，也可選假別（SPECIAL）；其餘班次仍擋
        if (!isLT && targetShift !== 'D' && targetShift !== 'OFF') return
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
      <PageHeader
        title={`${currentYear} 年 ${currentMonth} 月 班表`}
        meta={<StatusPill status={status} />}
        description={
          selectedTool
            ? '畫筆連選模式：單擊格位即可快速改班'
            : '點擊格位可手動微調班次，或選取下方畫筆快速連改'
        }
        actions={
          <>
          <Button
            variant="outline"
            onClick={() => setVersionOpen(true)}
            className="text-gray-700"
          >
            <History className="mr-2 h-4 w-4" />
            版本歷史
          </Button>
          {data && (
            <Button variant="outline" onClick={() => setExportOpen(true)} className="text-gray-700">
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
            disabled={clearMut.isPending || status === 'locked'}
            title={status === 'locked' ? '已鎖定月份請先解鎖才能清空' : undefined}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空當月排班
          </Button>
          <Button
            variant="outline"
            onClick={handleClearNight}
            disabled={clearNightMut.isPending || status === 'locked'}
            title={status === 'locked' ? '已鎖定月份請先解鎖才能清空' : undefined}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空大夜排班
          </Button>
          </>
        }
      />

      {/* 快速手動調整工具列 */}
      {!isLoading && !isError && !empty && status !== 'locked' && (
        <Toolbar className="border-blue-200 bg-blue-50/60">
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
            {leaveTypes.map((lt) => {
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
        </Toolbar>
      )}

      {isLoading && <LoadingState label="載入班表…" />}
      {isError && (
        <EmptyState
          tone="danger"
          icon={CircleAlert}
          title="載入失敗"
          description={error instanceof Error ? error.message : '未知錯誤'}
        />
      )}

      {!isLoading && !isError && empty && (
        <EmptyState
          icon={CalendarX}
          title="尚無排班資料"
          description={`請先到「休假管理」執行排班引擎產生 ${currentMonth} 月班表`}
          action={
            <Link to="/off-days">
              <Button>
                <Sparkles className="mr-2 h-4 w-4" />前往排班
              </Button>
            </Link>
          }
        />
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

      {!isLoading && !isError && data && status !== 'locked' && (
        <DBackupRequestPanel
          year={currentYear}
          month={currentMonth}
          numDays={data.num_days}
          requests={night?.d_backup_requests ?? []}
          onAdd={(d) => backupAddMut.mutateAsync(d)}
          onRemove={(id) => backupRemoveMut.mutateAsync(id)}
        />
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
            editingEmp.tag
              ? ['A1', 'C1', 'D1']
              : editingEmp.role === 'night'
                ? editingEmp.available_shifts
                : editingEmp.available_shifts.filter((s) => s !== 'D')
          }
          leaveTypes={editingEmp.tag ? [] : leaveTypes}
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

      {exportOpen && data && (
        <PrintPreviewModal
          open={exportOpen}
          year={currentYear}
          month={currentMonth}
          frontView={data}
          employees={employees}
          leaveTypes={leaveTypes}
          hotelName={hotelName}
          userName={userName}
          onClose={() => setExportOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmKind !== null}
        title={confirmKind ? confirmContent[confirmKind].title : ''}
        description={confirmKind ? confirmContent[confirmKind].description : undefined}
        confirmLabel={confirmKind ? confirmContent[confirmKind].confirmLabel : '確定'}
        loading={clearMut.isPending || clearNightMut.isPending || statusMut.isPending}
        onCancel={() => setConfirmKind(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  )
}

