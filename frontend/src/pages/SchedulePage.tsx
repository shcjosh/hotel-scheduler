import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, FileDown, History, Lock, RefreshCw, Sparkles, Trash2, Unlock, Send } from 'lucide-react'
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
import { AdjustScheduleModal } from '../components/schedule/AdjustScheduleModal'
import { ValidationReportPanel } from '../components/schedule/ValidationReport'
import { SupportRequestPanel } from '../components/support/SupportRequestPanel'
import { VersionHistoryDrawer } from '../components/schedule/VersionHistoryDrawer'
import { Button } from '../components/ui/button'
import { displayName } from '../utils/employee'
import type { ScheduleStatus } from '../types'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) => row.some((s) => s && s !== 'OFF'))
}

const STATUS_META: Record<ScheduleStatus, { label: string; dot: string; cls: string }> = {
  draft: { label: '草稿中', dot: '🟡', cls: 'bg-yellow-100 text-yellow-700' },
  published: { label: '已發布', dot: '🟢', cls: 'bg-green-100 text-green-700' },
  locked: { label: '已鎖定', dot: '🔒', cls: 'bg-gray-200 text-gray-700' },
}

export function SchedulePage() {
  const { currentYear, currentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ empName: string; day: number } | null>(null)
  const [versionOpen, setVersionOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

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
    onSuccess: () => invalidateAll(),
  })

  const statusMut = useMutation({
    mutationFn: (status: ScheduleStatus) => setScheduleStatus(currentYear, currentMonth, status),
    onSuccess: () => invalidateAll(),
  })

  const restoreMut = useMutation({
    mutationFn: (id: number) => restoreSnapshot(id),
    onSuccess: () => invalidateAll(),
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
          <p className="text-sm text-gray-500">點擊格位可手動微調班次</p>
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
            onCellClick={(empName, day) => setEditing({ empName, day })}
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
          availableShifts={editingEmp.available_shifts}
          leaveTypes={leaveTypes}
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
