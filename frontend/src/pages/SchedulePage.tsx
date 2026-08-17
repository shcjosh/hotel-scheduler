import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, Sparkles } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getEmployees } from '../api/employees'
import { getSchedule, getValidationReport, validateCell, updateScheduleEntry } from '../api/schedules'
import {
  getSupportRequests,
  createSupportRequest,
  updateSupportRequest,
  deleteSupportRequest,
} from '../api/support'
import { ScheduleTable } from '../components/schedule/ScheduleTable'
import { ShiftLegend } from '../components/schedule/ShiftLegend'
import { CellEditModal } from '../components/schedule/CellEditModal'
import { ValidationReportPanel } from '../components/schedule/ValidationReport'
import { SupportRequestPanel } from '../components/support/SupportRequestPanel'
import { Button } from '../components/ui/button'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) => row.some((s) => s && s !== 'OFF'))
}

export function SchedulePage() {
  const { currentYear, currentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ empName: string; day: number } | null>(null)

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['schedule', currentYear, currentMonth],
    queryFn: () => getSchedule(currentYear, currentMonth),
  })
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['validation', currentYear, currentMonth],
    queryFn: () => getValidationReport(currentYear, currentMonth),
  })
  const { data: supportReqs = [] } = useQuery({
    queryKey: ['support-requests', currentYear, currentMonth],
    queryFn: () => getSupportRequests(currentYear, currentMonth),
  })

  const supportMut = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['support-requests', currentYear, currentMonth] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ empId, day, shift }: { empId: number; day: number; shift: string }) =>
      updateScheduleEntry(empId, currentYear, currentMonth, day, shift),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', currentYear, currentMonth] })
      queryClient.invalidateQueries({ queryKey: ['validation', currentYear, currentMonth] })
    },
  })

  const empty = data ? !hasRealData(data.schedule) : false
  const editingEmp = editing ? employees.find((e) => e.name === editing.empName) : null
  const editingShift = editing && data ? data.schedule[editing.empName][editing.day - 1] : ''

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['schedule', currentYear, currentMonth] })
    queryClient.invalidateQueries({ queryKey: ['validation', currentYear, currentMonth] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            {currentYear} 年 {currentMonth} 月 排班表
          </h2>
          <p className="text-sm text-gray-500">點擊格位可手動微調班次</p>
        </div>
        <ShiftLegend />
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
          <Link to="/solve"><Button><Sparkles className="mr-2 h-4 w-4" />前往排班</Button></Link>
        </div>
      )}

      {!isLoading && !isError && !empty && data && (
        <>
          <ScheduleTable
            view={data}
            employees={employees}
            onCellClick={(empName, day) => setEditing({ empName, day })}
          />
          <ValidationReportPanel
            report={report}
            isLoading={reportLoading}
            onRefresh={() => invalidateAll()}
            onJumpTo={(empName, day) => setEditing({ empName, day })}
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
          employeeName={editing.empName}
          day={editing.day}
          month={currentMonth}
          currentShift={editingShift}
          availableShifts={editingEmp.available_shifts}
          onClose={() => setEditing(null)}
          onValidate={(newShift) =>
            validateCell(editingEmp.id, currentYear, currentMonth, editing.day, newShift)
          }
          onConfirm={async (newShift) => {
            await updateMut.mutateAsync({ empId: editingEmp.id, day: editing.day, shift: newShift })
          }}
        />
      )}
    </div>
  )
}
