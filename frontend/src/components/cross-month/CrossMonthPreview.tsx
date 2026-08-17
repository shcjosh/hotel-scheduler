import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { CrossMonthPreview } from '../../api/crossMonth'
import { cn } from '../../utils/cn'

interface CrossMonthPreviewProps {
  preview: CrossMonthPreview | undefined
}

export function CrossMonthPreview({ preview }: CrossMonthPreviewProps) {
  if (!preview) return null
  const violations = preview.violations
  const ok = violations.length === 0

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-lg border p-4',
          ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
        )}
      >
        {ok ? (
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">銜接合規 ✓</span>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-2 font-medium text-red-700">
              <AlertTriangle className="h-5 w-5" />
              銜接預覽（{violations.length} 項）
            </div>
            <ul className="space-y-1 text-sm text-red-700">
              {violations.map((v, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold">[{v.rule}]</span>
                  <span>{v.employee_name}：</span>
                  <span>{v.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {preview.cross_month_week_summary.length > 0 && (
        <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">員工</th>
                <th className="px-4 py-2 text-right">上月部分已休</th>
                <th className="px-4 py-2 text-right">本月可休</th>
                <th className="px-4 py-2 text-left">狀態</th>
              </tr>
            </thead>
            <tbody>
              {preview.cross_month_week_summary.map((s) => (
                <tr
                  key={s.employee_id}
                  className={cn(
                    'border-t border-gray-100',
                    s.at_limit && 'bg-red-50',
                  )}
                >
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {s.employee_name}
                  </td>
                  <td className="px-4 py-2 text-right">{s.prev_week_off_count}</td>
                  <td className="px-4 py-2 text-right">{s.remaining_off}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {s.at_limit ? '已達 2 天上限（本月不可再休）' : '正常'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
