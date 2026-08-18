import { AlertTriangle, ShieldOff } from 'lucide-react'
import type { NightEmployee, RuleOverrides } from '../../api/night'
import { cn } from '../../utils/cn'

interface RuleOverridePanelProps {
  nightEmployees: NightEmployee[]
  overrides: RuleOverrides | undefined
  onToggle: (empId: number, rule: NightRuleKey, value: boolean) => void
  onAll: (empId: number, value: boolean) => void
  onIgnoreAll: (empId: number, value: boolean) => void
}

type NightRuleKey = 'H2' | 'H3' | 'H4' | 'H12'

const RULE_LABELS: Record<NightRuleKey, string> = {
  H2: '每週休2天',
  H3: '週末限制',
  H4: '連續上班上限',
  H12: '連休2日限制',
}
const RULES: NightRuleKey[] = ['H2', 'H3', 'H4', 'H12']

export function RuleOverridePanel({
  nightEmployees, overrides, onToggle, onAll, onIgnoreAll,
}: RuleOverridePanelProps) {
  if (nightEmployees.length === 0) return null

  const anyIgnored = nightEmployees.some(
    (emp) => overrides?.[String(emp.id)]?.ignore_all,
  )
  const anyDisabled = nightEmployees.some((emp) => {
    const r = overrides?.[String(emp.id)]
    return r && !r.ignore_all && RULES.some((rule) => r[rule] === false)
  })

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-gray-800">大夜規則開關（逐人逐條）</h3>
      {anyIgnored && (
        <div className="flex items-center gap-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-700">
          <ShieldOff className="h-4 w-4" />
          部分大夜人員已「無視所有規則」：其個人規則（H2/H3/H4/H12 等）不進行驗證，A/B/C/M 班仍可正常自動排班。
        </div>
      )}
      {anyDisabled && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
          <AlertTriangle className="h-4 w-4" />
          部分大夜人員已關閉規則，關閉的規則不進行驗證，排班結果可能不符合標準。
        </div>
      )}
      <div className="space-y-2">
        {nightEmployees.map((emp) => {
          const state = overrides?.[String(emp.id)] ?? {
            H2: true, H3: true, H4: true, H12: true, ignore_all: false,
          }
          const ignoreAll = state.ignore_all
          const disabled = RULES.filter((rule) => state[rule] === false)
          return (
            <div key={emp.id} className="rounded-md border border-gray-100 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{emp.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => onAll(emp.id, true)}
                    disabled={ignoreAll}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-40"
                  >
                    全開
                  </button>
                  <button
                    onClick={() => onAll(emp.id, false)}
                    disabled={ignoreAll}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-40"
                  >
                    全關
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-md bg-orange-50 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={ignoreAll}
                  onChange={(e) => onIgnoreAll(emp.id, e.target.checked)}
                  className="h-4 w-4"
                />
                <span className={cn('font-medium', ignoreAll ? 'text-orange-700' : 'text-gray-700')}>
                  無視所有規則（含 H1-H13）
                </span>
              </label>
              {ignoreAll && (
                <div className="mt-1 text-xs text-orange-600">
                  已停用：H1-H13 全部規則（不影響 D 班人力備援）
                </div>
              )}

              <div className={cn('flex flex-wrap gap-3', ignoreAll && 'mt-1 opacity-40')}>
                {RULES.map((rule) => {
                  const on = state[rule] !== false
                  return (
                    <label key={rule} className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={ignoreAll}
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
              {!ignoreAll && disabled.length > 0 && (
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
