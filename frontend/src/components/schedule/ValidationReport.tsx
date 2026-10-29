import { CheckCircle2, CircleAlert, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ValidationReport } from '../../api/schedules'
import type { Employee } from '../../types'
import { nameMap } from '../../utils/employee'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { LoadingState } from '../ui/loading-state'
import { cn } from '../../utils/cn'

interface ValidationReportPanelProps {
  report: ValidationReport | undefined
  isLoading: boolean
  onRefresh: () => void
  onJumpTo?: (empName: string, day: number) => void
  employees: Employee[]
}

/** 整月規則驗證（放在 ScheduleSidePanel 的「驗證」分頁）。 */
export function ValidationReportPanel({
  report,
  isLoading,
  onRefresh,
  onJumpTo,
  employees,
}: ValidationReportPanelProps) {
  const names = nameMap(employees)
  const hard = report?.violations ?? []
  const soft = report?.warnings ?? []
  const clean = hard.length === 0 && soft.length === 0
  const perRule = report?.per_rule_summary ?? {}
  const compliantCount = Object.values(perRule).filter((rule) => rule.violations === 0).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {report ? (
          clean ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> 全部合規
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
              <TriangleAlert className="h-4 w-4" /> {hard.length} 違規／{soft.length} 警告
            </span>
          )
        ) : (
          <span className="text-sm text-slate-500">尚無驗證結果</span>
        )}
        <Button variant="ghost" size="sm" onClick={onRefresh} loading={isLoading}>
          {!isLoading && <RefreshCw className="mr-1 h-3.5 w-3.5" />} 重新整理
        </Button>
      </div>

      {!report && <LoadingState label="載入驗證報告…" />}

      {report && (
        <>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="text-red-600">硬性違規：{report.summary.hard_violations} 件</span>
            <span className="text-amber-600">軟性警告：{report.summary.soft_warnings} 件</span>
            <span>
              合規規則：{compliantCount}/{Object.keys(perRule).length} 條
            </span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left">規則</th>
                  <th className="px-2 py-1 text-left">說明</th>
                  <th className="px-2 py-1 text-center">狀態</th>
                  <th className="px-2 py-1 text-right">數量</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perRule).map(([rule, stat]) => (
                  <tr key={rule} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono font-semibold text-slate-700">{rule}</td>
                    <td className="px-2 py-1 text-slate-600">{stat.description}</td>
                    <td className="px-2 py-1 text-center">
                      {stat.violations === 0 ? (
                        <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <CircleAlert className="mx-auto h-3.5 w-3.5 text-red-600" />
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">{stat.violations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {clean ? (
            <EmptyState
              icon={CheckCircle2}
              title="沒有違規"
              description="目前班表符合所有硬性規則，軟性約束也沒有警告。"
            />
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">違規詳情</p>
              <ul className="space-y-1 text-sm">
                {hard.map((violation, index) => (
                  <li
                    key={`hard-${index}`}
                    className={cn(
                      'flex cursor-pointer flex-wrap items-center gap-1 rounded px-2 py-1 text-red-700 hover:bg-red-50',
                    )}
                    onClick={() =>
                      violation.employee_name && violation.day
                        ? onJumpTo?.(violation.employee_name, violation.day)
                        : undefined
                    }
                  >
                    <span className="font-semibold">[{violation.rule}]</span>
                    <span>
                      {violation.employee_name
                        ? (names.get(violation.employee_name) ?? violation.employee_name)
                        : '全體'}{' '}
                      {violation.day ? `${violation.day}日` : ''}：
                    </span>
                    <span>{violation.message}</span>
                  </li>
                ))}
                {soft.map((warning, index) => (
                  <li
                    key={`soft-${index}`}
                    className="flex cursor-pointer flex-wrap items-center gap-1 rounded px-2 py-1 text-amber-700 hover:bg-amber-50"
                    onClick={() =>
                      warning.employee_name && warning.day
                        ? onJumpTo?.(warning.employee_name, warning.day)
                        : undefined
                    }
                  >
                    <span className="font-semibold">[{warning.rule}]</span>
                    <span>
                      {warning.employee_name
                        ? (names.get(warning.employee_name) ?? warning.employee_name)
                        : '全體'}{' '}
                      {warning.day ? `${warning.day}日` : ''}：
                    </span>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
