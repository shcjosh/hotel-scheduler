import { useState } from 'react'
import { Info, Trash2 } from 'lucide-react'
import { getWeekday, getWeekdayLabel, isWeekend } from '../../utils/date'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { cn } from '../../utils/cn'
import type { BackupRequestData } from '../../api/night'

interface DBackupRequestPanelProps {
  year: number
  month: number
  numDays: number
  requests: BackupRequestData[]
  onAdd: (day: number) => Promise<unknown>
  onRemove: (id: number) => Promise<unknown>
}

/** D 班備援指示（放在 ScheduleSidePanel 的「大夜」分頁）。 */
export function DBackupRequestPanel({
  year,
  month,
  numDays,
  requests,
  onAdd,
  onRemove,
}: DBackupRequestPanelProps) {
  const [day, setDay] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    setError(null)
    try {
      await onAdd(day)
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          標記為 D 班備援日時，依序由 C+D 備援人員、管理職當天改排 D 班，系統會自動找人遞補 C 班。
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={day}
          onChange={(event) => setDay(Number(event.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {Array.from({ length: numDays }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {month}/{value}（{getWeekdayLabel(getWeekday(year, month, value))}）
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleAdd}>
          新增備援日
        </Button>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {requests.length === 0 ? (
        <EmptyState title="尚無備援指示" description="需要指定 D 班備援日時，在上方選擇日期新增。" />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left">日期</th>
              <th className="px-2 py-1 text-left">星期</th>
              <th className="px-2 py-1 text-left">狀態</th>
              <th className="px-2 py-1 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const weekend = isWeekend(year, month, request.day)
              return (
                <tr key={request.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium text-slate-800">
                    {month}/{request.day}
                  </td>
                  <td className={cn('px-2 py-1.5', weekend ? 'text-red-500' : 'text-slate-500')}>
                    {getWeekdayLabel(getWeekday(year, month, request.day))}
                  </td>
                  <td className="px-2 py-1.5">
                    {request.unfillable ? (
                      <div>
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          無法指派
                        </span>
                        <div className="mt-0.5 text-[10px] text-red-500">{request.reason}</div>
                      </div>
                    ) : request.assignee_name ? (
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs',
                          request.assignee_role === 'manager'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700',
                        )}
                      >
                        {request.assignee_role === 'manager' ? '管理職 ' : 'CD備援 '}
                        {request.assignee_name}
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        待指派
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => onRemove(request.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="刪除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
