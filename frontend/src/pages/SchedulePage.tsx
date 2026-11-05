import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarX, CircleAlert, FileDown, LockOpen, Printer, Send, Sparkles } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getEmployees } from '../api/employees'
import {
  getSchedule,
  getValidationReport,
  validateCell,
  updateScheduleEntry,
  clearSchedule,
} from '../api/schedules'
import { getLeaveTypes } from '../api/leaveTypes'
import { getSettings } from '../api/settings'
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
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { LoadingState } from '../components/ui/loading-state'
import { EmptyState } from '../components/ui/empty-state'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { useToast } from '../hooks/useToast'
import { useIsMobile } from '../hooks/useIsMobile'
import { MonthStatusBar, type SidePanelTab } from '../components/schedule/MonthStatusBar'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { ScheduleGrid } from '../components/schedule/ScheduleGrid'
import { PendingChangesBar } from '../components/schedule/PendingChangesBar'
import { ScheduleActionsMenu } from '../components/schedule/ScheduleActionsMenu'
import { ScheduleSidePanel } from '../components/schedule/ScheduleSidePanel'
import { ShiftLegend } from '../components/schedule/ShiftLegend'
import { CellEditModal } from '../components/schedule/CellEditModal'
import { BatchApplyModal, type PendingCellChange } from '../components/schedule/BatchApplyModal'
import { AdjustScheduleModal } from '../components/schedule/AdjustScheduleModal'
import { PrintPreviewModal } from '../components/schedule/PrintPreviewModal'
import { AnnualLeavePanel } from '../components/off-days/AnnualLeavePanel'
import { usePendingChanges } from '../hooks/usePendingChanges'
import { useScheduleBrush } from '../hooks/useScheduleBrush'
import { useGridSelection } from '../hooks/useGridSelection'
import {
  avatarColor,
  avatarText,
  displayName,
  isHousekeeping,
  isVisibleInMonth,
} from '../utils/employee'
import { splitPendingKey, type ScheduleGroup } from '../utils/brush'
import { cn } from '../utils/cn'
import type { ScheduleStatus } from '../types'
import type { CellViolation } from '../api/schedules'

type ConfirmKind = 'clear' | 'clear-night' | 'lock'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) =>
    row.some((shift) => shift && shift !== 'OFF' && shift !== 'EMPTY'),
  )
}

export function SchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const group: ScheduleGroup =
    searchParams.get('group') === 'housekeeping' ? 'housekeeping' : 'front'
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const isMobile = useIsMobile()

  const [editing, setEditing] = useState<{ empName: string; day: number } | null>(null)
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchChecking, setBatchChecking] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchViolations, setBatchViolations] = useState<CellViolation[]>([])
  const [batchWarnings, setBatchWarnings] = useState<CellViolation[]>([])
  const [dense, setDense] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [selectedHkId, setSelectedHkId] = useState<number | null>(null)
  const gridWrapRef = useRef<HTMLDivElement>(null)

  // ---- 資料 ----
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const frontQuery = useQuery({
    queryKey: ['schedule', year, month],
    queryFn: () => getSchedule(year, month, 'front'),
  })
  const hkQuery = useQuery({
    queryKey: ['housekeeping-schedule', year, month],
    queryFn: () => getSchedule(year, month, 'housekeeping'),
    enabled: group === 'housekeeping',
  })
  const activeQuery = group === 'housekeeping' ? hkQuery : frontQuery
  const view = activeQuery.data
  const frontView = frontQuery.data

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => getLeaveTypes(),
  })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })
  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', year, month],
    queryFn: () => getSnapshots(year, month),
  })
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['validation', year, month],
    queryFn: () => getValidationReport(year, month),
    enabled: group === 'front',
  })
  const { data: supportRequests = [] } = useQuery({
    queryKey: ['support-requests', year, month],
    queryFn: () => getSupportRequests(year, month),
    enabled: group === 'front',
  })
  const { data: night } = useQuery({
    queryKey: ['night', year, month],
    queryFn: () => getNightSchedule(year, month),
    enabled: group === 'front',
  })

  const status: ScheduleStatus = view?.status ?? 'draft'
  const locked = status === 'locked'
  const readOnly = locked || isMobile
  const numDays = view?.num_days ?? 30
  const hotelName = settings?.hotel_name ?? '清翼居府中館'
  const userName = settings?.user_name ?? 'Josh Wang'

  const hkEmployees = useMemo(
    () => employees.filter((e) => isHousekeeping(e) && isVisibleInMonth(e, year, month)),
    [employees, year, month],
  )
  const selectedHkEmployee =
    hkEmployees.find((e) => e.id === selectedHkId) ?? hkEmployees[0] ?? null

  // ---- 暫存 / 畫筆 / 選取 ----
  const pendingApi = usePendingChanges()
  const { pending, count, canUndo, canRedo } = pendingApi

  const getOriginal = useCallback(
    (empName: string, day: number) => ({
      shift: view?.schedule[empName]?.[day - 1] ?? '',
      leaveType: view?.leave_details?.[empName]?.[String(day)] ?? null,
    }),
    [view],
  )

  const brush = useScheduleBrush({
    group,
    employees,
    getOriginal,
    patch: pendingApi.patch,
  })

  const names = useMemo(() => (view ? Object.keys(view.schedule) : []), [view])
  const nameIndex = useMemo(() => new Map(names.map((name, index) => [name, index])), [names])

  const openEditor = useCallback(
    (empName: string, day: number) => {
      if (readOnly) return
      setEditing({ empName, day })
    },
    [readOnly],
  )

  const selection = useGridSelection(names, numDays, openEditor)

  // 換月／換分頁時把暫存、選取、畫筆清乾淨，避免套用到別的月份
  const { reset: resetPending } = pendingApi
  const { clear: clearSelection } = selection
  const { clearTool } = brush
  useEffect(() => {
    resetPending()
    clearSelection()
    clearTool()
    setSidePanelTab(null)
  }, [year, month, group, resetPending, clearSelection, clearTool])

  // Ctrl/Cmd+Z 復原、Ctrl/Cmd+Shift+Z 重做
  const { undo, redo } = pendingApi
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [redo, undo])

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(document.fullscreenElement === gridWrapRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // ---- 寫入 ----
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['schedule', year, month] })
    queryClient.invalidateQueries({ queryKey: ['housekeeping-schedule', year, month] })
    queryClient.invalidateQueries({ queryKey: ['validation', year, month] })
    queryClient.invalidateQueries({ queryKey: ['snapshots', year, month] })
    queryClient.invalidateQueries({ queryKey: ['night', year, month] })
    queryClient.invalidateQueries({ queryKey: ['support-requests', year, month] })
    queryClient.invalidateQueries({ queryKey: ['schedule-status', year, month] })
    queryClient.invalidateQueries({ queryKey: ['off-days', year, month] })
    queryClient.invalidateQueries({ queryKey: ['off-day-summary', year, month] })
    queryClient.invalidateQueries({ queryKey: ['annual-leave', year, month] })
  }

  const updateMut = useMutation({
    mutationFn: ({
      empId,
      day,
      shift,
      leaveType,
      reason,
    }: {
      empId: number
      day: number
      shift: string
      leaveType?: string
      reason?: string
    }) => updateScheduleEntry(empId, year, month, day, shift, leaveType, reason),
    onSuccess: () => invalidateAll(),
  })

  const statusMut = useMutation({
    mutationFn: (next: ScheduleStatus) => setScheduleStatus(year, month, next),
    onSuccess: () => invalidateAll(),
  })

  const clearMut = useMutation({
    mutationFn: () => clearSchedule(year, month, group),
    onSuccess: () => {
      pendingApi.reset()
      invalidateAll()
      toast('已清空本月班表')
    },
  })

  const clearNightMut = useMutation({
    mutationFn: () => clearNightSchedule(year, month),
    onSuccess: () => {
      pendingApi.reset()
      invalidateAll()
      toast('已清空本月大夜排班')
    },
  })

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreSnapshot(id),
    onSuccess: () => {
      pendingApi.reset()
      invalidateAll()
      toast('已還原版本')
    },
  })

  const supportMut = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['support-requests', year, month] }),
  })

  const backupAddMut = useMutation({
    mutationFn: (day: number) => addBackupRequest(year, month, day),
    onSuccess: () => invalidateAll(),
  })
  const backupRemoveMut = useMutation({
    mutationFn: (id: number) => removeBackupRequest(id),
    onSuccess: () => invalidateAll(),
  })

  // ---- 互動 ----
  function handleGroupChange(next: ScheduleGroup) {
    setSearchParams(next === 'housekeeping' ? { group: 'housekeeping' } : {}, { replace: true })
  }

  function handleCellClick(empName: string, day: number) {
    if (readOnly) return
    if (brush.consumeDragClick()) return
    if (brush.isActive) {
      brush.paint(empName, day)
      return
    }
    openEditor(empName, day)
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') return
    selection.handleKeyDown(event)
  }

  async function handleToggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await gridWrapRef.current?.requestFullscreen()
  }

  function handleSetStatus(next: ScheduleStatus) {
    if (readOnly) return
    if (next === 'locked') {
      setConfirmKind('lock')
      return
    }
    statusMut.mutate(next)
  }

  const pendingChangeList: PendingCellChange[] = Object.entries(pending).map(([key, change]) => {
    const { empName, day } = splitPendingKey(key)
    return {
      empName,
      day,
      shift:
        change.shift === 'SPECIAL' && change.leaveType
          ? `請假(${change.leaveType})`
          : change.shift,
      leaveType: change.leaveType,
      prevShift: view?.schedule[empName]?.[day - 1] ?? '',
    }
  })

  async function handleApply() {
    if (readOnly || Object.keys(pending).length === 0) return

    if (group === 'housekeeping') {
      setBatchSaving(true)
      try {
        for (const [key, change] of Object.entries(pending)) {
          const { empName, day } = splitPendingKey(key)
          const emp = employees.find((item) => item.name === empName)
          if (!emp) continue
          await updateScheduleEntry(emp.id, year, month, day, change.shift, change.leaveType)
        }
        pendingApi.reset()
        invalidateAll()
        toast(`已套用房務 ${Object.keys(pending).length} 處修改`)
      } catch (e) {
        toast('套用失敗', {
          tone: 'error',
          description: e instanceof Error ? e.message : '未知錯誤',
        })
      } finally {
        setBatchSaving(false)
      }
      return
    }

    // 櫃台：先逐格驗證，再開確認視窗
    setBatchModalOpen(true)
    setBatchChecking(true)
    setBatchViolations([])
    setBatchWarnings([])
    try {
      const hard: CellViolation[] = []
      const soft: CellViolation[] = []
      for (const [key, change] of Object.entries(pending)) {
        const { empName, day } = splitPendingKey(key)
        const emp = employees.find((item) => item.name === empName)
        if (!emp) continue
        const result = await validateCell(emp.id, year, month, day, change.shift)
        for (const violation of result.violations) {
          hard.push({ ...violation, message: `${empName} (${day}號): ${violation.message}` })
        }
        for (const warning of result.warnings) {
          soft.push({ ...warning, message: `${empName} (${day}號): ${warning.message}` })
        }
      }
      setBatchViolations(hard)
      setBatchWarnings(soft)
    } catch {
      setBatchViolations([{ rule: 'ERR', severity: 'hard', message: '檢查過程發生錯誤' }])
    } finally {
      setBatchChecking(false)
    }
  }

  async function handleBatchConfirm(reason?: string) {
    if (readOnly) return
    const entries = Object.entries(pending)
    if (entries.length === 0) return
    setBatchSaving(true)
    try {
      for (const [key, change] of entries) {
        const { empName, day } = splitPendingKey(key)
        const emp = employees.find((item) => item.name === empName)
        if (!emp) continue
        await updateScheduleEntry(
          emp.id,
          year,
          month,
          day,
          change.shift,
          change.leaveType,
          reason,
        )
      }
      pendingApi.reset()
      setBatchModalOpen(false)
      invalidateAll()
      toast(`已套用 ${entries.length} 處修改`)
    } catch (e) {
      toast('套用失敗', {
        tone: 'error',
        description: e instanceof Error ? e.message : '未知錯誤',
      })
    } finally {
      setBatchSaving(false)
    }
  }

  function handleConfirmAction() {
    if (readOnly) return
    const done = () => setConfirmKind(null)
    if (confirmKind === 'clear') clearMut.mutate(undefined, { onSettled: done })
    else if (confirmKind === 'clear-night') clearNightMut.mutate(undefined, { onSettled: done })
    else if (confirmKind === 'lock') statusMut.mutate('locked', { onSettled: done })
  }

  const confirmContent: Record<ConfirmKind, { title: string; description: string; label: string }> =
    {
      clear: {
        title: `清空 ${year} 年 ${month} 月${group === 'housekeeping' ? '房務' : ''}班表？`,
        description:
          group === 'housekeeping'
            ? '只會清除房務班表與房務假別紀錄，櫃台班表不受影響。此動作無法復原。'
            : '將刪除本月所有班表（手動輸入的大夜會保留），同時清除本月支援請求，班表狀態回到草稿。此動作無法復原。',
        label: group === 'housekeeping' ? '清空房務' : '清空排班',
      },
      'clear-night': {
        title: `清空 ${year} 年 ${month} 月大夜排班？`,
        description: '將清除本月所有大夜格位與大夜假別紀錄，白天班不受影響。此動作無法復原。',
        label: '清空大夜',
      },
      lock: {
        title: `鎖定 ${year} 年 ${month} 月班表？`,
        description: '鎖定後本月班表、休假與大夜皆為唯讀，需先解鎖才能修改。',
        label: '鎖定',
      },
    }

  const empty =
    group === 'housekeeping'
      ? hkEmployees.length === 0
      : view
        ? !hasRealData(view.schedule)
        : false
  const editingEmp = editing ? employees.find((e) => e.name === editing.empName) : null
  const editingShift = editing && view ? view.schedule[editing.empName]?.[editing.day - 1] : ''
  const editingLeaveCode =
    editing && view ? (view.leave_details?.[editing.empName]?.[String(editing.day)] ?? null) : null

  const hardViolations = report?.summary.hard_violations ?? 0
  const softWarnings = report?.summary.soft_warnings ?? 0
  const openSupports = supportRequests.filter((request) => request.status === 'open').length
  const version = snapshots.length > 0 ? snapshots[snapshots.length - 1].version_number : null

  const groupLabel = group === 'housekeeping' ? '房務班表' : '班表'

  return (
    <div className="space-y-3">
      <PageHeader
        title={`${year} 年 ${month} 月 ${groupLabel}`}
        description={
          isMobile
            ? '手機版唯讀：可檢視班表與列印／存 PDF；修改請使用桌機'
            : group === 'housekeeping'
              ? '房務手動排班（A 09:00-18:00，含 1 小時用餐）；與櫃台互不干涉、不做規則檢測'
              : '點擊格位微調班次，或選畫筆後單擊／拖曳連續塗色'
        }
        actions={
          <>
            {!isMobile && status === 'draft' && (
              <Button onClick={() => handleSetStatus('published')} loading={statusMut.isPending}>
                <Send className="mr-2 h-4 w-4" /> 發布班表
              </Button>
            )}
            {status === 'published' && (
              <Button onClick={() => setExportOpen(true)} disabled={!frontView}>
                <Printer className="mr-2 h-4 w-4" /> 列印 / PDF
              </Button>
            )}
            {!isMobile && status === 'locked' && (
              <Button
                variant="outline"
                onClick={() => statusMut.mutate('draft')}
                loading={statusMut.isPending}
              >
                <LockOpen className="mr-2 h-4 w-4" /> 解鎖
              </Button>
            )}
            {status !== 'published' && (
              <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!frontView}>
                <FileDown className="mr-2 h-4 w-4" /> 列印 / PDF
              </Button>
            )}
            {!isMobile && (
              <ScheduleActionsMenu
                status={status}
                canAdjust={
                  group === 'front' &&
                  status !== 'locked' &&
                  !!frontView &&
                  !!view &&
                  hasRealData(view.schedule)
                }
                showNightActions={group === 'front'}
                onOpenVersions={() => setSidePanelTab('version')}
                onOpenAdjust={() => setAdjustOpen(true)}
                onClear={() => setConfirmKind('clear')}
                onClearNight={() => setConfirmKind('clear-night')}
                onToggleLock={() =>
                  status === 'locked' ? statusMut.mutate('draft') : setConfirmKind('lock')
                }
              />
            )}
          </>
        }
      />

      <MonthStatusBar
        status={status}
        group={group}
        hardViolations={hardViolations}
        softWarnings={softWarnings}
        openSupports={openSupports}
        version={version}
        onOpenTab={setSidePanelTab}
      />

      <div className="space-y-2">
        <ScheduleToolbar
          group={group}
          onGroupChange={handleGroupChange}
          tool={brush.tool}
          onSelectTool={brush.setTool}
          onClearTool={brush.clearTool}
          leaveTypes={leaveTypes}
          dense={dense}
          onToggleDense={() => setDense((value) => !value)}
          fullscreen={fullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          locked={readOnly}
        />

        {activeQuery.isLoading && <LoadingState label="載入班表…" />}
        {activeQuery.isError && (
          <EmptyState
            tone="danger"
            icon={CircleAlert}
            title="載入失敗"
            description={
              activeQuery.error instanceof Error ? activeQuery.error.message : '未知錯誤'
            }
          />
        )}

        {!activeQuery.isLoading && !activeQuery.isError && empty && (
          <EmptyState
            icon={CalendarX}
            title={group === 'housekeeping' ? '尚無房務人員' : '尚無排班資料'}
            description={
              group === 'housekeeping'
                ? '請先到員工管理新增角色為「房務」的員工'
                : `請先到「休假管理」執行排班引擎產生 ${month} 月班表`
            }
            action={
              <Link to={group === 'housekeeping' ? '/employees' : '/off-days'}>
                <Button>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {group === 'housekeeping' ? '前往員工管理' : '前往排班'}
                </Button>
              </Link>
            }
          />
        )}

        {!activeQuery.isLoading && !activeQuery.isError && !empty && view && (
          <>
            <div
              ref={gridWrapRef}
              className={cn(
                fullscreen && 'flex h-full flex-col gap-2 overflow-auto bg-white p-3',
              )}
            >
              <ScheduleGrid
                view={view}
                employees={employees}
                leaveTypes={leaveTypes}
                pendingChanges={pending}
                showCoverage={group === 'front'}
                dense={dense}
                locked={readOnly}
                fullscreen={fullscreen}
                isSelected={(empName, day) => {
                  const index = nameIndex.get(empName)
                  return index === undefined ? false : selection.isSelected(index, day)
                }}
                onCellClick={handleCellClick}
                onCellPointerDown={brush.onPointerDown}
                onCellPointerEnter={brush.onPointerEnter}
                onKeyDown={handleGridKeyDown}
              />
              <ShiftLegend leaveTypes={leaveTypes} />
            </div>

            <PendingChangesBar
              count={count}
              canUndo={canUndo}
              canRedo={canRedo}
              applying={group === 'front' ? batchChecking : batchSaving}
              mode={group === 'front' ? 'check' : 'direct'}
              onUndo={pendingApi.undo}
              onRedo={pendingApi.redo}
              onDiscard={() => pendingApi.reset()}
              onApply={handleApply}
            />

            {group === 'housekeeping' && hkEmployees.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">特休紀錄對象：</span>
                  {hkEmployees.map((employee) => {
                    const selected = selectedHkEmployee?.id === employee.id
                    return (
                      <button
                        key={employee.id}
                        onClick={() => setSelectedHkId(employee.id)}
                        className="flex flex-col items-center gap-0.5"
                        title={displayName(employee)}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white transition',
                            avatarColor(employee.id),
                            selected
                              ? 'ring-2 ring-brand-500 ring-offset-2'
                              : 'opacity-70 hover:opacity-100',
                          )}
                        >
                          {avatarText(employee)}
                        </span>
                        <span
                          className={cn(
                            'text-xs',
                            selected ? 'font-medium text-brand-700' : 'text-slate-500',
                          )}
                        >
                          {employee.nickname || employee.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <AnnualLeavePanel employee={selectedHkEmployee} readOnly={readOnly} />
              </div>
            )}
          </>
        )}
      </div>

      {editing && editingEmp && view && (
        <CellEditModal
          open={true}
          employeeName={displayName(editingEmp)}
          day={editing.day}
          month={month}
          currentShift={editingShift ?? ''}
          currentLeaveTypeCode={editingLeaveCode}
          availableShifts={
            editingEmp.tag
              ? ['A1', 'C1', 'D1']
              : editingEmp.role === 'night'
                ? editingEmp.available_shifts
                : editingEmp.available_shifts.filter((shift) => shift !== 'D')
          }
          leaveTypes={editingEmp.tag ? [] : leaveTypes}
          isPublished={status === 'published'}
          onClose={() => setEditing(null)}
          onValidate={(newShift) =>
            validateCell(editingEmp.id, year, month, editing.day, newShift)
          }
          onConfirm={async (newShift, leaveType, reason) => {
            await updateMut.mutateAsync({
              empId: editingEmp.id,
              day: editing.day,
              shift: newShift,
              leaveType,
              reason,
            })
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

      <ScheduleSidePanel
        open={sidePanelTab !== null}
        tab={sidePanelTab ?? 'validation'}
        onTabChange={setSidePanelTab}
        onClose={() => setSidePanelTab(null)}
        group={group}
        employees={employees}
        counts={{ hard: hardViolations, soft: softWarnings, openSupports }}
        report={report}
        reportLoading={reportLoading}
        onRefreshReport={() => invalidateAll()}
        onJumpToCell={(empName, day) => {
          setSidePanelTab(null)
          openEditor(empName, day)
        }}
        year={year}
        month={month}
        numDays={numDays}
        supportRequests={supportRequests}
        onSupportAdd={(day, shift, reason) =>
          supportMut.mutateAsync(() => createSupportRequest(year, month, day, shift, reason))
        }
        onSupportUpdate={(id, nextStatus, resolution) =>
          supportMut.mutateAsync(() => updateSupportRequest(id, nextStatus, resolution))
        }
        onSupportRemove={(id) => supportMut.mutateAsync(() => deleteSupportRequest(id))}
        backupRequests={night?.d_backup_requests ?? []}
        onBackupAdd={(day) => backupAddMut.mutateAsync(day)}
        onBackupRemove={(id) => backupRemoveMut.mutateAsync(id)}
        snapshots={snapshots}
        snapshotsLoading={snapshotsLoading}
        onRestoreSnapshot={async (id) => {
          await restoreMut.mutateAsync(id)
        }}
        onDiffSnapshots={diffSnapshots}
        readOnly={isMobile}
      />

      {adjustOpen && view && (
        <AdjustScheduleModal
          year={year}
          month={month}
          employees={employees}
          leaveTypes={leaveTypes}
          numDays={numDays}
          onClose={() => setAdjustOpen(false)}
          onApplied={() => {
            pendingApi.reset()
            invalidateAll()
          }}
        />
      )}

      {exportOpen && frontView && (
        <PrintPreviewModal
          open={exportOpen}
          year={year}
          month={month}
          frontView={frontView}
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
        confirmLabel={confirmKind ? confirmContent[confirmKind].label : '確定'}
        loading={clearMut.isPending || clearNightMut.isPending || statusMut.isPending}
        onCancel={() => setConfirmKind(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  )
}
