import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { ScrollText } from 'lucide-react'
import type { ChangeLogEntry } from '../../api/scheduleMeta'
import { getShiftStyle } from '../../utils/shift'

function label(shift: string | null) {
  if (!shift) return '—'
  if (shift === 'OFF') return '休'
  if (shift === 'SPECIAL') return '特休'
  return shift
}

function ChangeLogList({ logs }: { logs: ChangeLogEntry[] }) {
  if (logs.length === 0) {
    return <EmptyState title="尚無調班紀錄" description="已發布班表的格位調整會記錄在這裡" />
  }
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li key={log.id} className="rounded-md border border-slate-200 p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">
              {log.month}/{log.day}
            </span>
            <span className={getShiftStyle(log.old_shift).text}>{label(log.old_shift)}</span>
            <span className="text-slate-400">→</span>
            <span className={getShiftStyle(log.new_shift).text}>{label(log.new_shift)}</span>
            {log.reason && (
              <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {log.reason}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{log.created_at}</div>
        </li>
      ))}
    </ul>
  )
}

interface ChangeLogPanelProps {
  logs: ChangeLogEntry[]
  /** true = 直接列出（給統計頁分頁用）；false = 按鈕 + Modal。 */
  inline?: boolean
}

export function ChangeLogPanel({ logs, inline }: ChangeLogPanelProps) {
  const [open, setOpen] = useState(false)

  if (inline) return <ChangeLogList logs={logs} />

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-slate-700">
        <ScrollText className="mr-2 h-4 w-4" />
        調班紀錄（{logs.length}）
      </Button>
      <Modal open={open} title="調班紀錄" onClose={() => setOpen(false)} className="max-w-2xl">
        <ChangeLogList logs={logs} />
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            關閉
          </Button>
        </div>
      </Modal>
    </>
  )
}
