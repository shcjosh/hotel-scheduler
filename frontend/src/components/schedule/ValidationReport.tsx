import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import type { ValidationReport } from '../../api/schedules'
import { cn } from '../../utils/cn'

interface ValidationReportPanelProps {
  report: ValidationReport | undefined
  isLoading: boolean
  onRefresh: () => void
  onJumpTo?: (empName: string, day: number) => void
}

export function ValidationReportPanel({ report, isLoading, onRefresh, onJumpTo }: ValidationReportPanelProps) {
  const [open, setOpen] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)

  const hard = report?.violations ?? []
  const soft = report?.warnings ?? []
  const ok = hard.length === 0 && soft.length === 0
  const perRule = report?.per_rule_summary ?? {}
  const compliantCount = Object.values(perRule).filter((r) => r.violations === 0).length

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium text-gray-800">規則驗證</span>
          {ok ? (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> 全部合規 ✓
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" /> {hard.length} 違規 / {soft.length} 警告
            </span>
          )}
        </div>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onRefresh() }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </span>
      </button>

      {open && report && (
        <div className="space-y-4 border-t border-gray-100 p-4">
          <div className="flex gap-6 text-sm">
            <span className="text-red-600">硬性違規：{report.summary.hard_violations} 件</span>
            <span className="text-yellow-600">軟性警告：{report.summary.soft_warnings} 件</span>
            <span className="text-gray-600">合規規則：{compliantCount}/{Object.keys(perRule).length} 條</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="px-2 py-1 text-left">規則</th>
                  <th className="px-2 py-1 text-left">說明</th>
                  <th className="px-2 py-1 text-center">狀態</th>
                  <th className="px-2 py-1 text-right">數量</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perRule).map(([rule, stat]) => (
                  <tr key={rule} className="border-t border-gray-100">
                    <td className="px-2 py-1 font-mono font-semibold text-gray-700">{rule}</td>
                    <td className="px-2 py-1 text-gray-600">{stat.description}</td>
                    <td className="px-2 py-1 text-center">
                      {stat.violations === 0 ? '✅' : '❌'}
                    </td>
                    <td className="px-2 py-1 text-right">{stat.violations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(hard.length > 0 || soft.length > 0) && (
            <div>
              <button
                onClick={() => setDetailOpen((o) => !o)}
                className="flex items-center gap-1 text-sm font-medium text-gray-700"
              >
                {detailOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                違規詳情
              </button>
              {detailOpen && (
                <ul className="mt-2 space-y-1 text-sm">
                  {hard.map((v, i) => (
                    <li
                      key={`h${i}`}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-red-700 hover:bg-red-50"
                      onClick={() => v.employee_name && v.day && onJumpTo?.(v.employee_name, v.day)}
                    >
                      <span className="font-semibold">[{v.rule}]</span>
                      <span>{v.employee_name ?? '全體'} {v.day ? `${v.day}日` : ''}：</span>
                      <span>{v.message}</span>
                    </li>
                  ))}
                  {soft.map((v, i) => (
                    <li
                      key={`s${i}`}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-yellow-700 hover:bg-yellow-50"
                      onClick={() => v.employee_name && v.day && onJumpTo?.(v.employee_name, v.day)}
                    >
                      <span className="font-semibold">[{v.rule}]</span>
                      <span>{v.employee_name ?? '全體'} {v.day ? `${v.day}日` : ''}：</span>
                      <span>{v.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
