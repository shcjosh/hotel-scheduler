import { useEffect, useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { getShiftStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'
import type { CellViolation } from '../../api/schedules'

interface CellEditModalProps {
  open: boolean
  employeeName: string
  day: number
  month: number
  currentShift: string
  availableShifts: string[]
  onClose: () => void
  onValidate: (newShift: string) => Promise<{ violations: CellViolation[]; warnings: CellViolation[] }>
  onConfirm: (newShift: string) => Promise<void>
}

const EXTRA = ['OFF', 'SPECIAL']

export function CellEditModal({
  open, employeeName, day, month, currentShift, availableShifts, onClose, onValidate, onConfirm,
}: CellEditModalProps) {
  const [newShift, setNewShift] = useState(currentShift)
  const [result, setResult] = useState<{ violations: CellViolation[]; warnings: CellViolation[] } | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNewShift(currentShift)
    setResult(null)
  }, [currentShift, open])

  const options = [...availableShifts, ...EXTRA.filter((s) => !availableShifts.includes(s))]

  async function handleCheck() {
    if (newShift === currentShift) {
      setResult({ violations: [], warnings: [] })
      return
    }
    setChecking(true)
    setResult(null)
    try {
      const r = await onValidate(newShift)
      setResult(r)
    } catch (e) {
      setResult({ violations: [{ rule: 'ERR', severity: 'hard', message: e instanceof Error ? e.message : '檢查失敗' }], warnings: [] })
    } finally {
      setChecking(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onConfirm(newShift)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const hasHard = (result?.violations.length ?? 0) > 0
  const hasSoft = (result?.warnings.length ?? 0) > 0
  const canSave = result !== null && newShift !== currentShift

  return (
    <Modal open={open} title={`編輯班次 — ${employeeName} ${month}/${day}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">目前：</span>
          <ShiftBadge shift={currentShift} />
          <span className="text-gray-400">→</span>
          <select
            value={newShift}
            onChange={(e) => { setNewShift(e.target.value); setResult(null) }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            {options.map((s) => (
              <option key={s} value={s}>{s === 'OFF' ? '休' : s === 'SPECIAL' ? '特休' : s}</option>
            ))}
          </select>
          <ShiftBadge shift={newShift} />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCheck} disabled={checking || newShift === currentShift}>
            {checking ? '檢查中…' : '檢查合規'}
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            {hasHard && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="mb-1 text-sm font-semibold text-red-700">違規（{result.violations.length}）</div>
                <ul className="space-y-1 text-xs text-red-700">
                  {result.violations.map((v, i) => (
                    <li key={i}>[{v.rule}] {v.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {hasSoft && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                <div className="mb-1 text-sm font-semibold text-yellow-700">提醒（{result.warnings.length}）</div>
                <ul className="space-y-1 text-xs text-yellow-700">
                  {result.warnings.map((v, i) => (
                    <li key={i}>[{v.rule}] {v.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {!hasHard && !hasSoft && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                無違規 ✓
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          {canSave && hasHard && (
            <Button variant="secondary" onClick={handleSave} disabled={saving}>
              {saving ? '儲存中…' : '仍要修改（強制）'}
            </Button>
          )}
          {canSave && !hasHard && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '儲存中…' : hasSoft ? '確認修改' : '儲存'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ShiftBadge({ shift }: { shift: string }) {
  const style = getShiftStyle(shift)
  return (
    <span className={cn('inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold', style.bg, style.text)}>
      {style.label}
    </span>
  )
}
