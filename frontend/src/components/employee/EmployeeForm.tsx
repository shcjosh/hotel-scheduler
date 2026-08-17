import { useEffect, useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { getShiftStyle } from '../../utils/shift'
import { ROLE_DEFAULTS, ROLE_LABELS, ALL_SHIFTS } from '../../utils/roles'
import { cn } from '../../utils/cn'
import type { Employee, EmployeeRole, SchedulingMode } from '../../types'
import type { EmployeePayload } from '../../api/employees'

interface EmployeeFormProps {
  open: boolean
  employee: Employee | null
  onClose: () => void
  onSubmit: (payload: EmployeePayload) => Promise<void>
}

export function EmployeeForm({ open, employee, onClose, onSubmit }: EmployeeFormProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<EmployeeRole>('general')
  const [shifts, setShifts] = useState<string[]>(['A', 'B', 'C'])
  const [preferred, setPreferred] = useState<string | null>(null)
  const [mode, setMode] = useState<SchedulingMode>('auto')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (employee) {
      setName(employee.name)
      setRole(employee.role)
      setShifts(employee.available_shifts)
      setPreferred(employee.preferred_shift)
      setMode(employee.scheduling_mode)
    } else {
      setName('')
      setRole('general')
      setShifts(['A', 'B', 'C'])
      setPreferred(null)
      setMode('auto')
    }
    setError(null)
  }, [employee, open])

  function handleRoleChange(next: EmployeeRole) {
    const def = ROLE_DEFAULTS[next]
    setRole(next)
    setShifts(def.shifts)
    setMode(def.mode)
    setPreferred((cur) => (cur && def.shifts.includes(cur) ? cur : null))
  }

  function toggleShift(s: string) {
    setShifts((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    )
    setPreferred((cur) => (cur && !shifts.includes(cur) ? null : cur))
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('姓名必填')
      return
    }
    if (shifts.length === 0) {
      setError('可上班班次至少勾選 1 個')
      return
    }
    if (preferred && !shifts.includes(preferred)) {
      setError('偏好班次必須在可上班班次中')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        role,
        available_shifts: shifts,
        preferred_shift: preferred,
        scheduling_mode: mode,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={employee ? '編輯員工' : '新增員工'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="姓名">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="請輸入姓名"
          />
        </Field>

        <Field label="角色">
          <select
            value={role}
            onChange={(e) => handleRoleChange(e.target.value as EmployeeRole)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="可上班班次">
          <div className="flex gap-2">
            {ALL_SHIFTS.map((s) => {
              const on = shifts.includes(s)
              const style = getShiftStyle(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleShift(s)}
                  className={cn(
                    'flex h-9 w-12 items-center justify-center rounded border-2 text-sm font-semibold transition',
                    style.bg,
                    style.text,
                    on ? 'border-indigo-500' : 'border-transparent opacity-40',
                  )}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="偏好班次">
          <select
            value={preferred ?? ''}
            onChange={(e) => setPreferred(e.target.value || null)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">無</option>
            {shifts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="排班方式">
          <div className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600">
            {mode === 'auto' ? '自動排班' : '手動輸入'}
            <span className="ml-2 text-xs text-gray-400">（依角色自動設定）</span>
          </div>
        </Field>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  )
}
