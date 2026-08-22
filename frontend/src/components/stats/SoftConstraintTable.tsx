import { cn } from '../../utils/cn'

interface SoftConstraintTableProps {
  stats: Record<string, number> | null
}

const ROWS: { key: string; rule: string; desc: string; ideal: string; good: (v: number) => boolean }[] = [
  { key: 's1_5consecutive_count', rule: 'S1', desc: '避免連續5天', ideal: '0 次', good: (v) => v === 0 },
  { key: 's2_b_to_a_count', rule: 'S2', desc: 'B→A 避免', ideal: '0 次', good: (v) => v === 0 },
  { key: 's3_c_to_b_count', rule: 'S3', desc: 'C→B 避免', ideal: '0 次', good: (v) => v === 0 },
  { key: 's5_preferred_satisfied', rule: 'S5', desc: '偏好滿足', ideal: '越多越好', good: (v) => v > 0 },
  { key: 's6_work_days_spread', rule: 'S6', desc: '公平性(差)', ideal: '≤ 2', good: (v) => v <= 2 },
  { key: 's7_non_backup_d_count', rule: 'S7', desc: '非備援D', ideal: '0 次', good: (v) => v === 0 },
  { key: 's8_manager_backup_count', rule: 'S8', desc: '管理職備援', ideal: '0 次', good: (v) => v === 0 },
  { key: 's9_off_block_count', rule: 'S9', desc: '連休次數', ideal: '越多越好', good: (v) => v >= 0 },
  { key: 's10_weekday_b_count', rule: 'S10 B', desc: '平日排 B', ideal: '越多越好', good: (v) => v >= 0 },
  { key: 's10_frisat_double_a_count', rule: 'S10 雙A', desc: '五六雙 A', ideal: '越多越好', good: (v) => v >= 0 },
  { key: 's10_frisat_double_c_count', rule: 'S10 雙C', desc: '五六雙 C', ideal: '越多越好', good: (v) => v >= 0 },
  { key: 's10_frisat_m_count', rule: 'S10 M', desc: '五六排 M', ideal: '越多越好', good: (v) => v >= 0 },
]

export function SoftConstraintTable({ stats }: SoftConstraintTableProps) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">規則</th>
            <th className="px-3 py-2 text-left">說明</th>
            <th className="px-3 py-2 text-right">達成值</th>
            <th className="px-3 py-2 text-right">理想值</th>
            <th className="px-3 py-2 text-center">狀態</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const v = stats?.[r.key] ?? 0
            const ok = r.good(v)
            return (
              <tr key={r.rule} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-mono font-semibold text-gray-700">{r.rule}</td>
                <td className="px-3 py-1.5 text-gray-600">{r.desc}</td>
                <td className="px-3 py-1.5 text-right text-gray-800">{v}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{r.ideal}</td>
                <td className={cn('px-3 py-1.5 text-center', ok ? 'text-green-600' : 'text-yellow-600')}>
                  {ok ? '✅' : '⚠️'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
