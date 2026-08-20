import { useState } from 'react'
import { Trash2, Info } from 'lucide-react'
import { getWeekday, getWeekdayLabel, isWeekend } from '../../utils/date'
import { Button } from '../ui/button'
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

export function DBackupRequestPanel({
  year, month, numDays, requests, onAdd, onRemove,
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
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-800">D 班備援指示</h3>
      </div>
      <div className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          標記為 D 班備援日時，依序由 C+D 備援人員、管理職當天改排 D 班，系統會自動找人遞補 C 班。
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {month}/{d}（{getWeekdayLabel(getWeekday(year, month, d))}）
            </option>
          ))}
        </select>
        <Button onClick={handleAdd}>新增備援日</Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {requests.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left">日期</th>
              <th className="px-2 py-1 text-left">星期</th>
              <th className="px-2 py-1 text-left">狀態</th>
              <th className="px-2 py-1 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const weekend = isWeekend(year, month, r.day)
              return (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 font-medium text-gray-800">
                    {month}/{r.day}
                  </td>
                  <td className={cn('px-2 py-1.5', weekend ? 'text-red-500' : 'text-gray-500')}>
                    {getWeekdayLabel(getWeekday(year, month, r.day))}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.unfillable ? (
                      <div>
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">無法指派</span>
                        <div className="mt-0.5 text-[10px] text-red-500">{r.reason}</div>
                      </div>
                    ) : r.assignee_name ? (
                      <span className={cn(
                        'rounded px-2 py-0.5 text-xs',
                        r.assignee_role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700',
                      )}>
                        {r.assignee_role === 'manager' ? '管理職 ' : 'CD備援 '}{r.assignee_name}
                      </span>
                    ) : (
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">待指派</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => onRemove(r.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-sm text-gray-400">尚無備援指示</div>
      )}
    </div>
  )
}
