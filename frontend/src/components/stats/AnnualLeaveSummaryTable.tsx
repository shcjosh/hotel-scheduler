import { useQuery } from '@tanstack/react-query'
import { getEmployees } from '../../api/employees'
import { getAnnualLeave } from '../../api/annualLeave'
import { useUIStore } from '../../stores/uiStore'
import { displayName } from '../../utils/employee'
import { cn } from '../../utils/cn'

function yearsLabel(years: number): string {
  if (years <= 0) return '滿 6 個月'
  return `滿 ${years} 年`
}

export function AnnualLeaveSummaryTable() {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data } = useQuery({
    queryKey: ['annual-leave', year, month],
    queryFn: () => getAnnualLeave(year, month),
  })

  const rows = employees.flatMap((e) => {
    const info = data?.employees?.[String(e.id)]
    if (!info || info.periods.length === 0) return []
    return info.periods.map((p) => ({ emp: e, info, p }))
  })

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        本月無特休資料（請於員工管理設定到職日）
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-4 py-2 text-left">員工</th>
            <th className="px-4 py-2 text-left">到職日</th>
            <th className="px-4 py-2 text-left">特休期間</th>
            <th className="px-4 py-2 text-left">年資</th>
            <th className="px-4 py-2 text-right">額度</th>
            <th className="px-4 py-2 text-right">已用</th>
            <th className="px-4 py-2 text-right">剩餘</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ emp, info, p }, i) => (
            <tr key={`${emp.id}-${p.period_start}-${i}`} className="border-t border-gray-100 hover:bg-indigo-50/40">
              <td className="px-4 py-2 font-medium text-gray-800">{displayName(emp)}</td>
              <td className="px-4 py-2 text-gray-600">{info.hire_date ?? '—'}</td>
              <td className="px-4 py-2 text-gray-600">
                {p.period_start} ~ {p.period_end}
              </td>
              <td className="px-4 py-2 text-gray-600">{yearsLabel(p.years)}</td>
              <td className="px-4 py-2 text-right">
                {p.entitlement}
                {p.entitlement_override != null && (
                  <span className="ml-1 text-xs text-purple-600">(覆寫)</span>
                )}
              </td>
              <td className="px-4 py-2 text-right">{p.used_days}</td>
              <td className={cn('px-4 py-2 text-right', p.remaining < 0 ? 'font-semibold text-red-600' : 'text-green-700')}>
                {p.remaining}
                {p.remaining < 0 && '（超用）'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
