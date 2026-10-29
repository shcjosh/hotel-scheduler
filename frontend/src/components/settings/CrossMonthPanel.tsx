import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, RefreshCw } from 'lucide-react'
import { getEmployees } from '../../api/employees'
import {
  getCrossMonth,
  getCrossMonthPreview,
  saveCrossMonth,
  type CrossMonthLink,
} from '../../api/crossMonth'
import { useUIStore } from '../../stores/uiStore'
import { Button } from '../ui/button'
import { Section } from '../ui/section'
import { LoadingState } from '../ui/loading-state'
import { EmptyState } from '../ui/empty-state'
import { CrossMonthForm } from '../cross-month/CrossMonthForm'
import { CrossMonthPreview } from '../cross-month/CrossMonthPreview'
import { isHousekeeping, isVisibleInMonth } from '../../utils/employee'

/** 跨月銜接（/settings?tab=cross-month），原 /cross-month 頁面內容。 */
export function CrossMonthPanel() {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data: crossMonth, isLoading } = useQuery({
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

  const links = crossMonth?.previous_month_links ?? {}
  const hasAuto = Object.values(links).some((link) => link.source === 'auto')
  const hasData = Object.keys(links).length > 0
  const scheduleEmployees = employees.filter(
    (employee) => !employee.tag && !isHousekeeping(employee) && isVisibleInMonth(employee, year, month),
  )

  return (
    <div className="space-y-4">
      <Section
        title={`${year} 年 ${month} 月 跨月銜接`}
        description={`上月：${crossMonth?.prev_month_name ?? '—'}｜最後 6 天：${crossMonth?.prev_last_dates?.[0] ?? '—'} ~ ${crossMonth?.prev_last_dates?.[5] ?? '—'}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => autoMut.mutate()} loading={autoMut.isPending}>
            {!autoMut.isPending && <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            自動載入上月排班
          </Button>
        }
        contentPadded
      >
        <div className="space-y-3">
          {hasAuto && (
            <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <Info className="h-4 w-4" />
              已自動載入上月排班（可編輯後儲存轉為手動）
            </div>
          )}
          {saveMut.isError && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              儲存失敗：{saveMut.error instanceof Error ? saveMut.error.message : '未知錯誤'}
            </div>
          )}

          {isLoading ? (
            <LoadingState label="載入跨月資料…" />
          ) : scheduleEmployees.length === 0 ? (
            <EmptyState title="尚無員工" description="請先到員工管理新增員工，才能設定跨月銜接" />
          ) : (
            <CrossMonthForm
              employees={scheduleEmployees}
              links={links}
              dates={crossMonth?.prev_last_dates ?? []}
              onSave={(next) => saveMut.mutateAsync(next)}
            />
          )}

          {!hasData && !isLoading && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              尚無跨月銜接資料。可點「自動載入上月排班」（若上月有排班），或直接手動輸入後儲存。
            </div>
          )}
        </div>
      </Section>

      <Section title="銜接預覽" description="上月最後一天 → 本月首日的班次銜接檢查（H5）">
        <CrossMonthPreview preview={preview} employees={scheduleEmployees} />
      </Section>
    </div>
  )
}
