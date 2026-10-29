import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { SupportRequest } from '../../api/support'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { cn } from '../../utils/cn'

interface SupportRequestPanelProps {
  requests: SupportRequest[]
  numDays: number
  month: number
  onAdd: (day: number, shift: string, reason: string) => Promise<unknown>
  onUpdate: (id: number, status: string, resolution: string | null) => Promise<unknown>
  onRemove: (id: number) => Promise<unknown>
}

/** 支援請求（放在 ScheduleSidePanel 的「支援」分頁）。 */
export function SupportRequestPanel({
  requests,
  numDays,
  month,
  onAdd,
  onUpdate,
  onRemove,
}: SupportRequestPanelProps) {
  const [adding, setAdding] = useState(false)
  const [day, setDay] = useState(1)
  const [shift, setShift] = useState('A')
  const [reason, setReason] = useState('')
  const [resolveId, setResolveId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openCount = requests.filter((request) => request.status === 'open').length

  async function handleAdd() {
    setError(null)
    const sameDay = requests.find((request) => request.day === day)
    if (sameDay) {
      setError(`${month}/${day} 已有支援請求（${sameDay.shift} 班），一天最多一個`)
      return
    }
    try {
      await onAdd(day, shift, reason)
      setAdding(false)
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗')
    }
  }

  async function handleResolve() {
    if (resolveId === null) return
    await onUpdate(resolveId, 'resolved', resolution)
    setResolveId(null)
    setResolution('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-600">
          {openCount > 0 ? `${openCount} 件待處理` : '沒有待處理的支援請求'}
        </span>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-3">
          <label className="text-xs text-slate-500">
            日期
            <select
              value={day}
              onChange={(event) => setDay(Number(event.target.value))}
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {Array.from({ length: numDays }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {month}/{value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            班次
            <select
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="A">A</option>
              <option value="C">C</option>
            </select>
          </label>
          <label className="flex-1 text-xs text-slate-500">
            原因
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="ml-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="缺人原因"
            />
          </label>
          <Button size="sm" onClick={handleAdd}>
            建立
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            取消
          </Button>
        </div>
      )}

      {requests.length === 0 ? (
        <EmptyState title="尚無支援請求" description="排班失敗時系統會自動產生支援請求，也可手動新增。" />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left">日期</th>
                <th className="px-2 py-1 text-left">班次</th>
                <th className="px-2 py-1 text-left">原因</th>
                <th className="px-2 py-1 text-left">來源</th>
                <th className="px-2 py-1 text-left">狀態</th>
                <th className="px-2 py-1 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium text-slate-800">
                    {request.day === 0 ? '全月' : `${month}/${request.day}`}
                  </td>
                  <td className="px-2 py-1.5">{request.shift}</td>
                  <td className="px-2 py-1.5 text-slate-600">{request.reason ?? '-'}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        request.source === 'auto'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {request.source === 'auto' ? '自動' : '手動'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        request.status === 'open'
                          ? 'bg-amber-100 text-amber-700'
                          : request.status === 'resolved' && request.source === 'auto'
                            ? 'bg-orange-100 text-orange-700'
                            : request.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {request.status === 'open'
                        ? '待處理'
                        : request.status === 'resolved' && request.source === 'auto'
                          ? '需要支援'
                          : request.status === 'resolved'
                            ? '已解決'
                            : '已忽略'}
                    </span>
                    {request.resolution && (
                      <div className="text-xs text-slate-400">{request.resolution}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      {request.status === 'open' && (
                        <>
                          <button
                            onClick={() => setResolveId(request.id)}
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                            title="解決"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onUpdate(request.id, 'ignored', null)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100"
                            title="忽略"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onRemove(request.id)}
                        className="rounded p-1 text-red-400 hover:bg-red-50"
                        title="刪除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolveId !== null && (
        <div className="flex items-center gap-2 rounded-md bg-slate-50 p-3">
          <input
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="解決方式說明"
          />
          <Button size="sm" onClick={handleResolve}>
            確認解決
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResolveId(null)}>
            取消
          </Button>
        </div>
      )}
    </div>
  )
}
