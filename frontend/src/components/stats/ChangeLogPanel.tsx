import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { ScrollText } from 'lucide-react'
import type { ChangeLogEntry } from '../../api/scheduleMeta'
import { getShiftStyle } from '../../utils/shift'

function label(shift: string | null) {
  if (!shift) return '—'
  if (shift === 'OFF') return '休'
  if (shift === 'SPECIAL') return '特休'
  return shift
}

export function ChangeLogPanel({ logs }: { logs: ChangeLogEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-gray-700">
        <ScrollText className="mr-2 h-4 w-4" />
        調班紀錄（{logs.length}）
      </Button>
      <Modal open={open} title="調班紀錄" onClose={() => setOpen(false)} className="max-w-2xl">
        {logs.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">
            尚無調班紀錄
          </div>
        ) : (
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="rounded-md border border-gray-200 p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">
                    {l.month}/{l.day}
                  </span>
                  <span className={getShiftStyle(l.old_shift).text}>{label(l.old_shift)}</span>
                  <span className="text-gray-400">→</span>
                  <span className={getShiftStyle(l.new_shift).text}>{label(l.new_shift)}</span>
                  {l.reason && (
                    <span className="ml-auto rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {l.reason}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-400">{l.created_at}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>關閉</Button>
        </div>
      </Modal>
    </>
  )
}
