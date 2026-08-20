import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import type { Employee, LeaveType } from '../../types'
import {
  adjustPreview,
  adjustApply,
  type AdjustPreviewResult,
} from '../../api/schedules'
import { Button } from '../ui/button'
import { Modal } from '../ui/modal'
import { ROLE_LABELS } from '../../utils/roles'
import { getShiftStyle } from '../../utils/shift'

interface AdjustScheduleModalProps {
  year: number
  month: number
  employees: Employee[]
  leaveTypes: LeaveType[]
  numDays: number
  onClose: () => void
  onApplied: () => void
}

export function AdjustScheduleModal({
  year, month, employees, leaveTypes, numDays, onClose, onApplied,
}: AdjustScheduleModalProps) {
  const nonNight = employees.filter((e) => e.role !== 'night')
  const [empId, setEmpId] = useState<number>(nonNight[0]?.id ?? 0)
  const [startDay, setStartDay] = useState(1)
  const [endDay, setEndDay] = useState(1)
  const [leaveType, setLeaveType] = useState('SPECIAL')
  const [preview, setPreview] = useState<AdjustPreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePreview() {
    setError(null)
    setLoading(true)
    setPreview(null)
    try {
      const days = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i)
      const r = await adjustPreview(year, month, empId, days, leaveType)
      setPreview(r)
      if (!r.success) setError(r.error ?? '調整失敗')
    } catch (e) {
      setError(e instanceof Error ? e.message : '預覽失敗')
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (!preview?.success) return
    setApplying(true)
    setError(null)
    try {
      await adjustApply(year, month, preview.changes)
      onApplied()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '套用失敗')
      setApplying(false)
    }
  }

  return (
    <Modal open title="臨時異動排班" onClose={onClose}>
      <div className="space-y-4">
        {nonNight.length === 0 ? (
          <div className="text-sm text-gray-500">沒有可調整的一般員工</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">員工</span>
                <select
                  value={empId}
                  onChange={(e) => setEmpId(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {nonNight.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}（{ROLE_LABELS[e.role] ?? e.role}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">請假起</span>
                <select
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{month}/{d}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">請假迄</span>
                <select
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{month}/{d}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">假別</span>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.code} value={lt.code}>{lt.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {!preview && (
              <Button onClick={handlePreview} disabled={loading || startDay > endDay}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                預覽變動
              </Button>
            )}

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            {preview?.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  受影響 {preview.affected_count} 人、共 {preview.changes.length} 格變動
                </div>
                <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-2 py-1 text-left">員工</th>
                        <th className="px-2 py-1 text-left">日期</th>
                        <th className="px-2 py-1 text-left">變動</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.changes.map((c, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1">{c.employee_name}</td>
                          <td className="px-2 py-1 text-gray-600">{month}/{c.day}</td>
                          <td className="px-2 py-1">
                            <span className={getShiftStyle(c.old_shift).text}>{c.old_shift}</span>
                            <span className="mx-1 text-gray-400">→</span>
                            <span className={getShiftStyle(c.new_shift).text}>{c.new_shift}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleApply} disabled={applying}>
                    {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    確認套用
                  </Button>
                  <Button variant="outline" onClick={() => setPreview(null)}>重新選擇</Button>
                </div>
              </div>
            )}

            {preview && !preview.success && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{preview.error ?? '無法調整，請檢查約束'}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
