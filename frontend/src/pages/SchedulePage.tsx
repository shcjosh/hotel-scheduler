import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarX, Sparkles } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getSchedule } from '../api/schedules'
import { ScheduleTable } from '../components/schedule/ScheduleTable'
import { ShiftLegend } from '../components/schedule/ShiftLegend'
import { Button } from '../components/ui/button'

function hasRealData(schedule: Record<string, string[]>): boolean {
  return Object.values(schedule).some((row) =>
    row.some((s) => s && s !== 'OFF'),
  )
}

export function SchedulePage() {
  const { currentYear, currentMonth } = useUIStore()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['schedule', currentYear, currentMonth],
    queryFn: () => getSchedule(currentYear, currentMonth),
  })

  const empty = data ? !hasRealData(data.schedule) : false

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            {currentYear} 年 {currentMonth} 月 排班表
          </h2>
          <p className="text-sm text-gray-500">飯店每日班次總覽</p>
        </div>
        <ShiftLegend />
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          載入中…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-600">
          載入失敗：{error instanceof Error ? error.message : '未知錯誤'}
        </div>
      )}

      {!isLoading && !isError && empty && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <CalendarX className="mb-3 h-12 w-12 text-gray-300" />
          <p className="mb-1 text-lg font-medium text-gray-700">
            尚無排班資料
          </p>
          <p className="mb-4 text-sm text-gray-500">
            請先執行排班引擎產生 {currentMonth} 月班表
          </p>
          <Link to="/solve">
            <Button>
              <Sparkles className="mr-2 h-4 w-4" />
              前往排班
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && !isError && !empty && data && <ScheduleTable view={data} />}
    </div>
  )
}
