import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { ROLE_LABELS } from '../../utils/roles'
import { getShiftStyle } from '../../utils/shift'
import { displayName } from '../../utils/employee'
import { cn } from '../../utils/cn'
import type { Employee } from '../../types'
import type { CrossMonthLink } from '../../api/crossMonth'

interface CrossMonthFormProps {
  employees: Employee[]
  links: Record<string, CrossMonthLink>
  dates: string[]
  onSave: (links: CrossMonthLink[]) => Promise<unknown>
}

const OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '空' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'M', label: 'M' },
  { value: 'OFF', label: '休' },
  { value: 'SPECIAL', label: '特休' },
]

const SHIFT_KEYS = ['day_5_shift', 'day_4_shift', 'day_3_shift', 'day_2_shift', 'day_1_shift'] as const

export function CrossMonthForm({ employees, links, dates, onSave }: CrossMonthFormProps) {
  const [draft, setDraft] = useState<Record<string, CrossMonthLink>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft({ ...links })
  }, [links])

  function setShift(empId: number, key: (typeof SHIFT_KEYS)[number], value: string) {
    const keyStr = String(empId)
    const cur = draft[keyStr] ?? {
      employee_id: empId,
      day_5_shift: null, day_4_shift: null, day_3_shift: null,
      day_2_shift: null, day_1_shift: null, source: 'manual',
    }
    setDraft({ ...draft, [keyStr]: { ...cur, [key]: value || null, source: 'manual' } })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(Object.values(draft))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="border-collapse text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="sticky left-0 z-10 w-32 bg-gray-100 px-3 py-2 text-left">員工</th>
              {dates.map((d, i) => (
                <th key={d} className="w-20 border-l border-gray-200 px-2 py-2 text-center text-xs">
                  <div>{d}</div>
                  <div className="text-gray-400">倒數第 {5 - i} 天</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const link = draft[String(emp.id)]
              return (
                <tr key={emp.id} className="border-t border-gray-100">
                  <th className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-medium text-gray-700">
                    {displayName(emp)}
                    <span className="ml-1 text-xs text-gray-400">
                      {ROLE_LABELS[emp.role]}
                    </span>
                  </th>
                  {SHIFT_KEYS.map((key) => {
                    const val = link?.[key] ?? ''
                    const style = val ? getShiftStyle(val) : null
                    return (
                      <td key={key} className="border-l border-gray-200 px-1 py-1 text-center">
                        <select
                          value={val}
                          onChange={(e) => setShift(emp.id, key, e.target.value)}
                          className={cn(
                            'h-8 w-16 rounded border border-gray-300 text-center text-xs font-semibold',
                            style ? `${style.bg} ${style.text}` : 'text-gray-400',
                          )}
                        >
                          {OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? '儲存中…' : '儲存跨月銜接'}
        </Button>
      </div>
    </div>
  )
}
