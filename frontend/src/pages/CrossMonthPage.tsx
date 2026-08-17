import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Info } from 'lucide-react'
import { getEmployees } from '../api/employees'
import {
  getCrossMonth,
  getCrossMonthPreview,
  saveCrossMonth,
  type CrossMonthLink,
} from '../api/crossMonth'
import { useUIStore } from '../stores/uiStore'
import { CrossMonthForm } from '../components/cross-month/CrossMonthForm'
import { CrossMonthPreview } from '../components/cross-month/CrossMonthPreview'
import { Button } from '../components/ui/button'

export function CrossMonthPage() {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data: cm, isLoading } = useQuery({
    queryKey: ['cross-month', year, month],
    queryFn: () => getCrossMonth(year, month),
  })
  const { data: preview } = useQuery({
    queryKey: ['cross-month-preview', year, month],
    queryFn: () => getCrossMonthPreview(year, month),
  })

  const autoMut = useMutation({
    mutationFn: () => getCrossMonth(year, month, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-month', year, month] })
      queryClient.invalidateQueries({ queryKey: ['cross-month-preview', year, month] })
    },
  })
  const saveMut = useMutation({
    mutationFn: (links: CrossMonthLink[]) => saveCrossMonth(year, month, links),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-month', year, month] })
      queryClient.invalidateQueries({ queryKey: ['cross-month-preview', year, month] })
    },
  })

  const links = cm?.previous_month_links ?? {}
  const hasAuto = Object.values(links).some((l) => l.source === 'auto')
  const hasData = Object.keys(links).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">跨月設定</h2>
          <p className="text-sm text-gray-500">
            排班月份：{year}年{month}月 · 上月：{cm?.prev_month_name ?? '—'}
            ，最後 5 天：{cm?.prev_last_5_dates?.[0] ?? '—'}~
            {cm?.prev_last_5_dates?.[4] ?? '—'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => autoMut.mutate()}
          disabled={autoMut.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${autoMut.isPending ? 'animate-spin' : ''}`} />
          自動載入上月排班
        </Button>
      </div>

      {hasAuto && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Info className="h-4 w-4" />
          已自動載入上月排班（可編輯後儲存轉為手動）
        </div>
      )}
      {saveMut.isError && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">
          儲存失敗：{saveMut.error instanceof Error ? saveMut.error.message : '未知錯誤'}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          載入中…
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
          尚無員工
        </div>
      ) : (
        <CrossMonthForm
          employees={employees}
          links={links}
          dates={cm?.prev_last_5_dates ?? []}
          onSave={(l) => saveMut.mutateAsync(l)}
        />
      )}

      {!hasData && !isLoading && (
        <div className="rounded-md bg-orange-50 px-4 py-2 text-sm text-orange-700">
          尚無跨月銜接資料。可點「自動載入上月排班」（若上月有排班），或直接手動輸入後儲存。
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">銜接預覽</h3>
        <CrossMonthPreview preview={preview} />
      </div>
    </div>
  )
}
