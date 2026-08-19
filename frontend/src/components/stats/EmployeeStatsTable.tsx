import type { EmployeeStats } from '../../api/stats'
import { ROLE_LABELS } from '../../utils/roles'
import { cn } from '../../utils/cn'

const SHIFT_COLS = ['A', 'B', 'C', 'D', 'M', 'OFF'] as const
const SHIFT_COLORS: Record<string, string> = {
  A: 'text-blue-700', B: 'text-orange-700', C: 'text-purple-700',
  D: 'text-indigo-700', M: 'text-teal-700', OFF: 'text-red-700',
}

interface LeaveTypeInfo {
  code: string
  name: string
  color_bg: string
  color_text: string
}

export function EmployeeStatsTable({
  rows,
  leaveTypes,
}: { rows: EmployeeStats[]; leaveTypes: LeaveTypeInfo[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="sticky left-0 bg-gray-100 px-3 py-2 text-left">員工</th>
            <th className="px-2 py-2 text-left">角色</th>
            {SHIFT_COLS.map((s) => (
              <th key={s} className="px-2 py-2 text-right">{s === 'OFF' ? '休' : s}</th>
            ))}
            {leaveTypes.map((lt) => (
              <th key={lt.code} className="px-2 py-2 text-right">{lt.name}</th>
            ))}
            <th className="px-2 py-2 text-right">請假合計</th>
            <th className="px-2 py-2 text-right">總上班</th>
            <th className="px-2 py-2 text-right">週末上班</th>
            <th className="px-2 py-2 text-right">最長連班</th>
            <th className="px-2 py-2 text-right">連休次數</th>
            <th className="px-2 py-2 text-right">偏好滿足</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.employee_id} className="border-t border-gray-100 hover:bg-indigo-50/40">
              <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-gray-800">{e.employee_name}</td>
              <td className="px-2 py-1.5 text-gray-600">{ROLE_LABELS[e.role as keyof typeof ROLE_LABELS] ?? e.role}</td>
              {SHIFT_COLS.map((s) => (
                <td key={s} className={cn('px-2 py-1.5 text-right font-medium', SHIFT_COLORS[s])}>
                  {e.shift_counts[s] ?? 0}
                </td>
              ))}
              {leaveTypes.map((lt) => (
                <td key={lt.code} className="px-2 py-1.5 text-right text-gray-600">
                  {e.leave_type_counts?.[lt.code] ?? 0}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold text-gray-800">{e.total_leave_days}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-gray-800">{e.total_work_days}</td>
              <td className="px-2 py-1.5 text-right text-gray-600">{e.weekend_work_count}</td>
              <td className={cn('px-2 py-1.5 text-right', e.max_consecutive_work > 5 ? 'font-bold text-red-600' : 'text-gray-600')}>
                {e.max_consecutive_work}
              </td>
              <td className={cn('px-2 py-1.5 text-right', e.consecutive_off_count === 2 ? 'text-green-600' : 'font-bold text-orange-600')}>
                {e.consecutive_off_count}/2
              </td>
              <td className="px-2 py-1.5 text-right text-gray-600">{e.preferred_satisfied}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
