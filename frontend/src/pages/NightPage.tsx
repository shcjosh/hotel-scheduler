import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react'
import {
  getNightSchedule,
  getNightValidation,
  saveNightEntry,
  deleteNightEntry,
  addBackupRequest,
  removeBackupRequest,
  getRuleOverrides,
  updateRuleOverrides,
  clearNightSchedule,
} from '../api/night'
import { getEmployees } from '../api/employees'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import { NightInputTable } from '../components/night/NightInputTable'
import { DBackupRequestPanel } from '../components/night/DBackupRequestPanel'
import { RuleOverridePanel } from '../components/night/RuleOverridePanel'
import { Button } from '../components/ui/button'
import { cn } from '../utils/cn'

export function NightPage() {
  const { currentYear: year, currentMonth: month, solveEnableDBackup, setSolveEnableDBackup } = useUIStore()
  const queryClient = useQueryClient()
  const numDays = getMonthDays(year, month)

  const { data: night, isLoading } = useQuery({
    queryKey: ['night', year, month],
    queryFn: () => getNightSchedule(year, month),
  })
  const { data: validation } = useQuery({
    queryKey: ['night-validation', year, month],
    queryFn: () => getNightValidation(year, month),
  })
  const { data: ruleOverrides } = useQuery({
    queryKey: ['night-rule-overrides', year, month],
    queryFn: () => getRuleOverrides(year, month),
  })
  useQuery({ queryKey: ['employees'], queryFn: () => getEmployees() })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['night', year, month] })
    queryClient.invalidateQueries({ queryKey: ['night-validation', year, month] })
    queryClient.invalidateQueries({ queryKey: ['night-rule-overrides', year, month] })
  }

  const ruleMut = useMutation({
    mutationFn: async ({ empId, payload }: { empId: number; payload: { rules?: Record<string, boolean>; all?: boolean; ignore_all?: boolean } }) =>
      updateRuleOverrides(empId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['night-rule-overrides', year, month] }),
  })

  const entryMut = useMutation({
    mutationFn: async ({ empId, day, value }: { empId: number; day: number; value: 'D' | 'OFF' | '' }) => {
      if (value === '') {
        await deleteNightEntry(year, month, day, empId)
      } else {
        await saveNightEntry(year, month, day, empId, value)
      }
    },
    onSuccess: invalidate,
    onError: () => invalidate(),
  })
  const addBackupMut = useMutation({
    mutationFn: (day: number) => addBackupRequest(year, month, day),
    onSuccess: invalidate,
  })
  const removeBackupMut = useMutation({
    mutationFn: (id: number) => removeBackupRequest(id),
    onSuccess: invalidate,
  })
  const clearNightMut = useMutation({
    mutationFn: () => clearNightSchedule(year, month),
    onSuccess: invalidate,
  })

  function handleClearNight() {
    if (window.confirm(`確定要清空 ${year} 年 ${month} 月的大夜排班嗎？`)) {
      clearNightMut.mutate()
    }
  }

  const violations = validation?.violations ?? []
  const allIgnored = validation?.all_ignored ?? false
  const ok = violations.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">大夜班表</h2>
          <p className="text-sm text-gray-500">
            {year}年{month}月 — 大夜專職人員 D 班手動輸入
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={solveEnableDBackup}
              onChange={(e) => setSolveEnableDBackup(e.target.checked)}
              className="h-4 w-4"
            />
            啟用 D 班備援邏輯
          </label>
          <Button
            variant="outline"
            onClick={handleClearNight}
            disabled={clearNightMut.isPending}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            清空大夜排班
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          載入中…
        </div>
      ) : (
        <NightInputTable
          year={year}
          month={month}
          numDays={numDays}
          nightEmployees={night?.night_employees ?? []}
          nightSchedule={night?.night_schedule ?? {}}
          onEntryChange={(empId, day, value) => entryMut.mutate({ empId, day, value })}
        />
      )}

      <DBackupRequestPanel
        year={year}
        month={month}
        numDays={numDays}
        requests={night?.d_backup_requests ?? []}
        onAdd={(d) => addBackupMut.mutateAsync(d)}
        onRemove={(id) => removeBackupMut.mutateAsync(id)}
      />

      <RuleOverridePanel
        nightEmployees={night?.night_employees ?? []}
        overrides={ruleOverrides}
        onToggle={(empId, rule, value) =>
          ruleMut.mutate({
            empId,
            payload: {
              rules: {
                H2: (ruleOverrides?.[String(empId)]?.H2 ?? true),
                H3: (ruleOverrides?.[String(empId)]?.H3 ?? true),
                H4: (ruleOverrides?.[String(empId)]?.H4 ?? true),
                H12: (ruleOverrides?.[String(empId)]?.H12 ?? true),
                [rule]: value,
              },
            },
          })
        }
        onAll={(empId, value) => ruleMut.mutate({ empId, payload: { all: value } })}
        onIgnoreAll={(empId, value) => ruleMut.mutate({ empId, payload: { ignore_all: value } })}
      />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">合規驗證</h3>
        <div
          className={cn(
            'rounded-lg border p-4',
            allIgnored
              ? 'border-blue-200 bg-blue-50'
              : ok
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50',
          )}
        >
          {allIgnored ? (
            <div className="flex items-center gap-2 text-blue-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">已略過所有規則檢驗 ✓</span>
            </div>
          ) : ok ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">大夜班表合規 ✓</span>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center gap-2 font-medium text-red-700">
                <AlertTriangle className="h-5 w-5" />
                違規（{violations.length} 項）
              </div>
              <ul className="space-y-1 text-sm text-red-700">
                {violations.map((v, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-semibold">[{v.rule}]</span>
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
