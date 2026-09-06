import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import type { CellViolation } from '../../api/schedules'

export interface PendingCellChange {
  empName: string
  day: number
  shift: string
  leaveType?: string
  prevShift: string
}

interface BatchApplyModalProps {
  open: boolean
  changes: PendingCellChange[]
  isPublished: boolean
  violations: CellViolation[]
  warnings: CellViolation[]
  isChecking: boolean
  isSaving: boolean
  onClose: () => void
  onConfirm: (reason?: string) => Promise<void>
}

export function BatchApplyModal({
  open,
  changes,
  isPublished,
  violations,
  warnings,
  isChecking,
  isSaving,
  onClose,
  onConfirm,
}: BatchApplyModalProps) {
  const [reason, setReason] = useState('')

  const hasHard = violations.length > 0
  const hasSoft = warnings.length > 0

  async function handleSave() {
    await onConfirm(reason.trim() || undefined)
  }

  return (
    <Modal open={open} title={`確認套用修改（共 ${changes.length} 處）`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-sm font-medium text-gray-700">修改清單</div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
            <ul className="space-y-1">
              {changes.map((c, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    {c.empName} ({c.day}號)
                  </span>
                  <span className="text-gray-500">
                    {c.prevShift} → <span className="font-semibold text-blue-600">{c.shift}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {isPublished && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">調班原因（選填）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：同仁換班、主管調整"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}

        {isChecking ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-center text-sm text-blue-700">
            合規檢查中…
          </div>
        ) : (
          <div className="space-y-2">
            {hasHard && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="mb-1 text-sm font-semibold text-red-700">
                  違規（{violations.length} 項）
                </div>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-red-700">
                  {violations.map((v, i) => (
                    <li key={i}>
                      [{v.rule}] {v.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasSoft && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                <div className="mb-1 text-sm font-semibold text-yellow-700">
                  提醒（{warnings.length} 項）
                </div>
                <ul className="max-h-24 space-y-1 overflow-y-auto text-xs text-yellow-700">
                  {warnings.map((v, i) => (
                    <li key={i}>
                      [{v.rule}] {v.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!hasHard && !hasSoft && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                全部合規 ✓
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          {hasHard ? (
            <Button variant="secondary" onClick={handleSave} disabled={isChecking || isSaving}>
              {isSaving ? '套用中…' : '仍要套用（強制）'}
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={isChecking || isSaving}>
              {isSaving ? '套用中…' : '確認套用'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
