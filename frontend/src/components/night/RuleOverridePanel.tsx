import { AlertTriangle } from 'lucide-react'
import type { NightEmployee, RuleOverrides } from '../../api/night'
import { cn } from '../../utils/cn'

interface RuleOverridePanelProps {
  nightEmployees: NightEmployee[]
  overrides: RuleOverrides | undefined
  onToggle: (empId: number, rule: string, value: boolean) => void
  onAll: (empId: number, value: boolean) => void
}

const RULE_LABELS: Record<string, string> = {
  H2: '每週休2天',
  H3: '週末限制',
  H4: '連續上班上限',
  H12: '連休2日限制',
}
const RULES = ['H2', 'H3', 'H4', 'H12']

export function RuleOverridePanel({
  nightEmployees, overrides, onToggle, onAll,
}: RuleOverridePanelProps) {
  if (nightEmployees.length === 0) return null

  const anyDisabled = nightEmployees.some((emp) => {
    const r = overrides?.[String(emp.id)]
    return r && RULES.some((rule) => !r[rule])
  })

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-gray-800">大夜規則開關（逐人逐條）</h3>
      {anyDisabled && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
          <AlertTriangle className="h-4 w-4" />
          部分大夜人員已關閉規則，關閉的規則不進行驗證，排班結果可能不符合標準。
        </div>
      )}
      <div className="space-y-2">
        {nightEmployees.map((emp) => {
          const r = overrides?.[String(emp.id)] ?? {}
          const disabled = RULES.filter((rule) => r[rule] === false)
          return (
            <div key={emp.id} className="rounded-md border border-gray-100 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{emp.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => onAll(emp.id, true)}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
                  >
                    全開
                  </button>
                  <button
                    onClick={() => onAll(emp.id, false)}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
                  >
                    全關
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {RULES.map((rule) => {
                  const on = r[rule] !== false
                  return (
                    <label key={rule} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => onToggle(emp.id, rule, e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      <span className={cn(!on && 'text-gray-400 line-through')}>
                        {rule} {RULE_LABELS[rule]}
                      </span>
                    </label>
                  )
                })}
              </div>
              {disabled.length > 0 && (
                <div className="mt-1 text-xs text-yellow-600">
                  已停用：{disabled.join('、')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
