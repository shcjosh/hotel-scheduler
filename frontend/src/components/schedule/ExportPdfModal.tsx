import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { getSchedule } from '../../api/schedules'
import { printSchedule } from '../../utils/printSchedule'
import { isHousekeeping } from '../../utils/employee'
import type { Employee, LeaveType, MonthScheduleView } from '../../types'

interface ExportPdfModalProps {
  open: boolean
  year: number
  month: number
  frontView: MonthScheduleView
  employees: Employee[]
  leaveTypes: LeaveType[]
  hotelName: string
  onClose: () => void
}

function prevMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1]
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

export function ExportPdfModal({
  open,
  year,
  month,
  frontView,
  employees,
  leaveTypes,
  hotelName,
  onClose,
}: ExportPdfModalProps) {
  const [wholeWeek, setWholeWeek] = useState(false)
  const [includeHousekeeping, setIncludeHousekeeping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasHousekeeping = employees.some((e) => isHousekeeping(e))

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      let frontNeighbors: MonthScheduleView[] = []
      let housekeepingNeighbors: MonthScheduleView[] = []
      let housekeepingView: MonthScheduleView | null = null

      if (wholeWeek) {
        const [py, pm] = prevMonth(year, month)
        const [ny, nm] = nextMonth(year, month)
        if (includeHousekeeping) {
          const [p, n] = await Promise.all([
            getSchedule(py, pm, 'housekeeping'),
            getSchedule(ny, nm, 'housekeeping'),
          ])
          housekeepingNeighbors = [p, n]
        }
        const [pf, nf] = await Promise.all([
          getSchedule(py, pm, 'front'),
          getSchedule(ny, nm, 'front'),
        ])
        frontNeighbors = [pf, nf]
      }
      if (includeHousekeeping) {
        housekeepingView = await getSchedule(year, month, 'housekeeping')
      }

      printSchedule({
        frontView,
        housekeepingView,
        frontNeighborViews: frontNeighbors,
        housekeepingNeighborViews: housekeepingNeighbors,
        employees,
        leaveTypes,
        hotelName,
        wholeWeek,
        includeHousekeeping,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="匯出 PDF" onClose={onClose}>
      <div className="space-y-4">
        <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
          <input
            type="checkbox"
            checked={wholeWeek}
            onChange={(e) => setWholeWeek(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">整週模式（週一~週日）</span>
            <span className="block text-xs text-gray-500">
              往前補到當月 1 日所屬週的週一、往後補到月底所屬週的週日（例：9 月會含 8/31 與 10/1~10/4）。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
          <input
            type="checkbox"
            checked={includeHousekeeping}
            disabled={!hasHousekeeping}
            onChange={(e) => setIncludeHousekeeping(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">顯示房務班表</span>
            <span className="block text-xs text-gray-500">
              {hasHousekeeping
                ? '同一張 A4 加印房務表（上：櫃台、下：房務）。'
                : '目前沒有房務人員。'}
            </span>
          </span>
        </label>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? '準備中…' : '匯出'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
