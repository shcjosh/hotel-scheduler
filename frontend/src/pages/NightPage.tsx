import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  getNightSchedule,
  getNightValidation,
  saveNightEntry,
  deleteNightEntry,
  addBackupRequest,
  removeBackupRequest,
} from '../api/night'
import { getEmployees } from '../api/employees'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import { NightInputTable } from '../components/night/NightInputTable'
import { DBackupRequestPanel } from '../components/night/DBackupRequestPanel'
import { cn } from '../utils/cn'

export function NightPage() {
  const { currentYear: year, currentMonth: month } = useUIStore()
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
  useQuery({ queryKey: ['employees'], queryFn: () => getEmployees() })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['night', year, month] })
    queryClient.invalidateQueries({ queryKey: ['night-validation', year, month] })
  }

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

  const violations = validation?.violations ?? []
  const ok = violations.length === 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">大夜班表</h2>
        <p className="text-sm text-gray-500">
          {year}年{month}月 — 大夜專職人員 D 班手動輸入
        </p>
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

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">合規驗證</h3>
        <div
          className={cn(
            'rounded-lg border p-4',
            ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
          )}
        >
          {ok ? (
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
