import type { MonthStats } from '../../api/stats'
import { cn } from '../../utils/cn'

export function MonthSummaryCard({ stats }: { stats: MonthStats }) {
  const ms = stats.month_summary
  const v = stats.violations_summary
  const statusLabel = ms.solve_status === 'solved' ? '✅ 已排班' : ms.solve_status === 'unsolved' ? '❌ 未排班' : '— 無資料'
  const cells = [
    { label: '總班次數', value: ms.total_shifts },
    { label: '求解狀態', value: statusLabel },
    { label: '目標函數', value: ms.objective_value ?? '—' },
    { label: '求解時間', value: ms.solve_time != null ? `${ms.solve_time.toFixed(3)}s` : '—' },
    { label: '硬性違規', value: v.hard_violations },
    { label: '軟性警告', value: v.soft_warnings },
    { label: '合規狀態', value: v.is_valid ? '✅ 合規' : '❌ 違規' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {cells.map((c) => (
        <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-500">{c.label}</div>
          <div className={cn('mt-1 text-lg font-semibold', c.label.includes('違規') && c.value !== 0 ? 'text-red-600' : 'text-gray-800')}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
