import { useEffect, useId, useState } from 'react'
import { Drawer } from '../ui/drawer'
import { Field, controlClassName } from '../ui/field'
import { Button } from '../ui/button'
import { getShiftStyle } from '../../utils/shift'
import { ROLE_DEFAULTS, ROLE_LABELS, ALL_SHIFTS } from '../../utils/roles'
import { getRuleOverrides, type NightRuleState } from '../../api/night'
import { useUIStore } from '../../stores/uiStore'
import { cn } from '../../utils/cn'
import type { Employee, EmployeeRole, SchedulingMode } from '../../types'
import type { EmployeePayload } from '../../api/employees'

const DEFAULT_NIGHT_RULES: NightRuleState = {
  H2: true, H3: true, H4: true, H12: true, ignore_all: false,
}
const NIGHT_RULE_LABELS: Record<'H2' | 'H3' | 'H4' | 'H12', string> = {
  H2: '每週休2天',
  H3: '週末限制',
  H4: '連續上班上限',
  H12: '連休2日限制',
}

interface EmployeeFormProps {
  open: boolean
  employee: Employee | null
  onClose: () => void
  onSubmit: (payload: EmployeePayload, nightRules: NightRuleState | null) => Promise<void>
}

export function EmployeeForm({ open, employee, onClose, onSubmit }: EmployeeFormProps) {
  const { currentYear, currentMonth } = useUIStore()
  const baseId = useId()
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [tag, setTag] = useState('')
  const [role, setRole] = useState<EmployeeRole>('general')
  const [shifts, setShifts] = useState<string[]>(['A', 'B', 'C'])
  const [preferred, setPreferred] = useState<string | null>(null)
  const [mode, setMode] = useState<SchedulingMode>('auto')
  const [resignDate, setResignDate] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [nightRules, setNightRules] = useState<NightRuleState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (employee) {
      setName(employee.name)
      setNickname(employee.nickname ?? '')
      setTag(employee.tag ?? '')
      setRole(employee.role)
      setShifts(employee.available_shifts)
      setPreferred(employee.preferred_shift)
      setMode(employee.scheduling_mode)
      setResignDate(employee.resign_date ?? '')
      setHireDate(employee.hire_date ?? '')
    } else {
      setName('')
      setNickname('')
      setTag('')
      setRole('general')
      setShifts(['A', 'B', 'C'])
      setPreferred(null)
      setMode('auto')
      setResignDate('')
      setHireDate('')
    }
    setError(null)
  }, [employee, open])

  // 大夜專職：載入規則開關現值（新增員工則用預設全開）
  useEffect(() => {
    if (role !== 'night') {
      setNightRules(null)
      return
    }
    if (!employee) {
      setNightRules({ ...DEFAULT_NIGHT_RULES })
      return
    }
    let alive = true
    getRuleOverrides(currentYear, currentMonth).then((ov) => {
      if (alive) setNightRules(ov[String(employee.id)] ?? { ...DEFAULT_NIGHT_RULES })
    }).catch(() => {
      if (alive) setNightRules({ ...DEFAULT_NIGHT_RULES })
    })
    return () => {
      alive = false
    }
  }, [role, employee, open, currentYear, currentMonth])

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
      await onSubmit(
        {
          name: name.trim(),
          nickname: nickname.trim() || null,
          tag: tag.trim() || null,
          resign_date: resignDate.trim() || null,
          hire_date: hireDate.trim() || null,
          role,
          available_shifts: shifts,
          preferred_shift: preferred,
          scheduling_mode: mode,
        },
        role === 'night' ? nightRules : null,
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={employee ? '編輯員工' : '新增員工'}
      description="員工資料、角色、可用班次與大夜規則都在這裡設定"
      onClose={onClose}
      widthClassName="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            儲存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="姓名" htmlFor={`${baseId}-name`} required>
          <input
            id={`${baseId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={controlClassName}
            placeholder="請輸入姓名"
          />
        </Field>

        <Field label="暱稱（選填）" htmlFor={`${baseId}-nickname`}>
          <input
            id={`${baseId}-nickname`}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={controlClassName}
            placeholder="如：John"
          />
        </Field>

        <Field
          label="標籤（選填，如「二館」）"
          htmlFor={`${baseId}-tag`}
          hint="有標籤的員工視為二館支援：手動排 A1/C1/D1，不納入自動排班與跨月規則。"
        >
          <input
            id={`${baseId}-tag`}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={controlClassName}
            placeholder="如：二館"
          />
        </Field>

        <Field
          label="到職日（選填）"
          htmlFor={`${baseId}-hire-date`}
          hint="用於自動計算特休週年期間與額度（勞基法）；留空 = 不計算特休。"
        >
          <input
            id={`${baseId}-hire-date`}
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className={controlClassName}
          />
        </Field>

        <Field
          label="離職日（最後上班日，選填）"
          htmlFor={`${baseId}-resign-date`}
          hint="設定後，離職日之後不再排班；離職月之後的班表不再顯示此人。留空 = 在職。"
        >
          <input
            id={`${baseId}-resign-date`}
            type="date"
            value={resignDate}
            onChange={(e) => setResignDate(e.target.value)}
            className={controlClassName}
          />
        </Field>

        <Field label="角色" htmlFor={`${baseId}-role`}>
          <select
            id={`${baseId}-role`}
            value={role}
            onChange={(e) => handleRoleChange(e.target.value as EmployeeRole)}
            className={controlClassName}
          >
            {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="可上班班次" hint="至少勾選 1 個；房務固定只能上 A。">
          <div className="flex flex-wrap gap-2">
            {(role === 'housekeeping' ? ['A'] : ALL_SHIFTS).map((s) => {
              const on = shifts.includes(s)
              const style = getShiftStyle(s)
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
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

        <Field label="偏好班次" htmlFor={`${baseId}-preferred`}>
          <select
            id={`${baseId}-preferred`}
            value={preferred ?? ''}
            onChange={(e) => setPreferred(e.target.value || null)}
            className={controlClassName}
          >
            <option value="">無</option>
            {shifts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="排班方式" hint="依角色自動設定：一般／管理職自動排班，房務／二館支援手動。">
          <div className="rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600">
            {mode === 'auto' ? '自動排班' : '手動輸入'}
          </div>
        </Field>

        {role === 'night' && nightRules && (
          <Field label="大夜規則開關">
            <div className="space-y-2 rounded-md border border-gray-200 p-3">
              <label className="flex items-center gap-2 rounded-md bg-orange-50 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={nightRules.ignore_all}
                  onChange={(e) => setNightRules({ ...nightRules, ignore_all: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className={cn('font-medium', nightRules.ignore_all ? 'text-orange-700' : 'text-gray-700')}>
                  無視所有規則（含 H1-H13）
                </span>
              </label>
              {nightRules.ignore_all && (
                <div className="text-xs text-orange-600">
                  已停用 H1-H13 全部規則（不影響 D 班人力備援）
                </div>
              )}
              <div className={cn('flex flex-wrap gap-3', nightRules.ignore_all && 'opacity-40')}>
                {(['H2', 'H3', 'H4', 'H12'] as const).map((rule) => {
                  const on = nightRules[rule] !== false
                  return (
                    <label key={rule} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={nightRules.ignore_all}
                        onChange={(e) => setNightRules({ ...nightRules, [rule]: e.target.checked })}
                        className="h-3.5 w-3.5"
                      />
                      <span className={cn(!on && 'text-gray-400 line-through')}>
                        {rule} {NIGHT_RULE_LABELS[rule]}
                      </span>
                    </label>
                  )
                })}
              </div>
              {!nightRules.ignore_all &&
                ['H2', 'H3', 'H4', 'H12'].some((r) => nightRules[r as 'H2'] === false) && (
                  <div className="text-xs text-yellow-600">
                    已停用：
                    {(['H2', 'H3', 'H4', 'H12'] as const)
                      .filter((r) => nightRules[r] === false)
                      .join('、')}
                    （關閉的規則不進行驗證）
                  </div>
                )}
            </div>
          </Field>
        )}

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Drawer>
  )
}
