import { useEffect, useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { getShiftStyle, getLeaveTypeStyle } from '../../utils/shift'
import { cn } from '../../utils/cn'
import type { CellViolation } from '../../api/schedules'
import type { LeaveType } from '../../types'

interface CellEditModalProps {
  open: boolean
  employeeName: string
  day: number
  month: number
  currentShift: string
  currentLeaveTypeCode?: string | null
  availableShifts: string[]
  leaveTypes: LeaveType[]
  isPublished?: boolean
  onClose: () => void
  onValidate: (newShift: string) => Promise<{ violations: CellViolation[]; warnings: CellViolation[] }>
  onConfirm: (newShift: string, leaveType?: string, reason?: string) => Promise<void>
}

const LT_PREFIX = 'LT:'

export function CellEditModal({
  open, employeeName, day, month, currentShift, currentLeaveTypeCode, availableShifts,
  leaveTypes, isPublished, onClose, onValidate, onConfirm,
}: CellEditModalProps) {
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<{ violations: CellViolation[]; warnings: CellViolation[] } | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentLeaveType = leaveTypes.find((lt) => lt.code === currentLeaveTypeCode)

  useEffect(() => {
    setReason('')
    setResult(null)
    setSelected(
      currentShift === 'SPECIAL' && currentLeaveTypeCode
        ? `${LT_PREFIX}${currentLeaveTypeCode}`
        : currentShift,
    )
  }, [currentShift, currentLeaveTypeCode, open])

  const shiftOptions = [
    ...availableShifts.filter((s) => s !== 'SPECIAL'),
    'OFF',
  ]

  function effectiveShift() {
    return selected.startsWith(LT_PREFIX) ? 'SPECIAL' : selected
  }
  function effectiveLeaveType() {
    return selected.startsWith(LT_PREFIX) ? selected.slice(LT_PREFIX.length) : undefined
  }
  function changed() {
    const cur = currentShift === 'SPECIAL' && currentLeaveTypeCode
      ? `${LT_PREFIX}${currentLeaveTypeCode}`
      : currentShift
    return selected !== cur
  }

  async function handleCheck() {
    if (!changed()) {
      setResult({ violations: [], warnings: [] })
      return
    }
    setChecking(true)
    setResult(null)
    try {
      const r = await onValidate(effectiveShift())
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
      await onConfirm(effectiveShift(), effectiveLeaveType(), reason.trim() || undefined)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const hasHard = (result?.violations.length ?? 0) > 0
  const hasSoft = (result?.warnings.length ?? 0) > 0
  const canSave = result !== null && changed()

  return (
    <Modal open={open} title={`編輯班次 — ${employeeName} ${month}/${day}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">目前：</span>
          <ShiftBadge shift={currentShift} leaveType={currentLeaveType} />
          <span className="text-gray-400">→</span>
          <ShiftBadge
            shift={effectiveShift()}
            leaveType={leaveTypes.find((lt) => lt.code === effectiveLeaveType())}
          />
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-gray-700">班別</div>
          <div className="flex flex-wrap gap-2">
            {shiftOptions.map((s) => {
              const style = getShiftStyle(s)
              const active = selected === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSelected(s); setResult(null) }}
                  className={cn(
                    'inline-flex h-9 min-w-11 items-center justify-center rounded-md px-2 text-sm font-semibold transition',
                    style.bg,
                    style.text,
                    active ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-70 hover:opacity-100',
                  )}
                >
                  {style.label}
                </button>
              )
            })}
          </div>
        </div>

        {leaveTypes.length > 0 && (
          <div>
            <div className="mb-1.5 text-sm font-medium text-gray-700">假別</div>
            <div className="flex flex-wrap gap-2">
              {leaveTypes.map((lt) => {
                const active = selected === `${LT_PREFIX}${lt.code}`
                return (
                  <button
                    key={lt.code}
                    type="button"
                    onClick={() => { setSelected(`${LT_PREFIX}${lt.code}`); setResult(null) }}
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition',
                      active ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-70 hover:opacity-100',
                    )}
                    style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
                  >
                    {lt.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isPublished && changed() && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">調班原因（選填）</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：與同仁換班、臨時請病假"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCheck} disabled={checking || !changed()}>
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

function ShiftBadge({ shift, leaveType }: { shift: string; leaveType?: LeaveType | null }) {
  const leaveStyle = shift === 'SPECIAL' ? getLeaveTypeStyle(leaveType) : null
  const style = leaveStyle ?? getShiftStyle(shift)
  if (leaveStyle) {
    return (
      <span
        className="inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold"
        style={{ backgroundColor: leaveStyle.bg, color: leaveStyle.text }}
      >
        {leaveStyle.label}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold', style.bg, style.text)}>
      {style.label}
    </span>
  )
}
