import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X } from 'lucide-react'
import type { SupportRequest } from '../../api/support'
import { Button } from '../ui/button'
import { cn } from '../../utils/cn'

interface SupportRequestPanelProps {
  requests: SupportRequest[]
  numDays: number
  month: number
  onAdd: (day: number, shift: string, reason: string) => Promise<unknown>
  onUpdate: (id: number, status: string, resolution: string | null) => Promise<unknown>
  onRemove: (id: number) => Promise<unknown>
}

export function SupportRequestPanel({
  requests, numDays, month, onAdd, onUpdate, onRemove,
}: SupportRequestPanelProps) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [day, setDay] = useState(1)
  const [shift, setShift] = useState('A')
  const [reason, setReason] = useState('')
  const [resolveId, setResolveId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open_count = requests.filter((r) => r.status === 'open').length

  async function handleAdd() {
    setError(null)
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium text-gray-800">支援請求</span>
          {open_count > 0 && (
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
              {open_count} 件待處理
            </span>
          )}
        </div>
        <Button
          variant="outline"
          onClick={(e) => { e.stopPropagation(); setAdding(true) }}
        >
          <Plus className="mr-1 h-4 w-4" /> 新增
        </Button>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 p-4">
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          {adding && (
            <div className="flex flex-wrap items-end gap-2 rounded-md bg-gray-50 p-3">
              <div>
                <label className="text-xs text-gray-500">日期</label>
                <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="ml-1 rounded border px-2 py-1 text-sm">
                  {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{month}/{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">班次</label>
                <select value={shift} onChange={(e) => setShift(e.target.value)} className="ml-1 rounded border px-2 py-1 text-sm">
                  <option value="A">A</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">原因</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="ml-1 w-full rounded border px-2 py-1 text-sm" placeholder="缺人原因" />
              </div>
              <Button onClick={handleAdd}>建立</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
            </div>
          )}

          {requests.length === 0 ? (
            <div className="text-sm text-gray-400">尚無支援請求</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500">
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
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 font-medium text-gray-800">
                      {r.day === 0 ? '全月' : `${month}/${r.day}`}
                    </td>
                    <td className="px-2 py-1.5">{r.shift}</td>
                    <td className="px-2 py-1.5 text-gray-600">{r.reason ?? '-'}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn('rounded px-1.5 py-0.5 text-xs', r.source === 'auto' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600')}>
                        {r.source === 'auto' ? '自動' : '手動'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn('rounded px-1.5 py-0.5 text-xs',
                        r.status === 'open' ? 'bg-orange-100 text-orange-700' :
                        r.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {r.status === 'open' ? '待處理' : r.status === 'resolved' ? '已解決' : '已忽略'}
                      </span>
                      {r.resolution && <div className="text-xs text-gray-400">{r.resolution}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        {r.status === 'open' && (
                          <>
                            <button onClick={() => setResolveId(r.id)} className="rounded p-1 text-green-600 hover:bg-green-50" title="解決">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => onUpdate(r.id, 'ignored', null)} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="忽略">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button onClick={() => onRemove(r.id)} className="rounded p-1 text-red-400 hover:bg-red-50" title="刪除">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {resolveId !== null && (
            <div className="flex items-center gap-2 rounded-md bg-gray-50 p-3">
              <input value={resolution} onChange={(e) => setResolution(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" placeholder="解決方式說明" />
              <Button onClick={handleResolve}>確認解決</Button>
              <Button variant="ghost" onClick={() => setResolveId(null)}>取消</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
