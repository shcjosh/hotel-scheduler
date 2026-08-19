import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { RotateCcw, GitCompareArrows } from 'lucide-react'
import type { ScheduleSnapshot, SnapshotDiffChange } from '../../api/scheduleMeta'

interface VersionHistoryDrawerProps {
  open: boolean
  snapshots: ScheduleSnapshot[]
  onClose: () => void
  onRestore: (id: number) => Promise<void>
  onDiff: (aId: number, bId: number) => Promise<{ changes: SnapshotDiffChange[] }>
}

export function VersionHistoryDrawer({
  open, snapshots, onClose, onRestore, onDiff,
}: VersionHistoryDrawerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aId, setAId] = useState<string>('')
  const [bId, setBId] = useState<string>('')
  const [diff, setDiff] = useState<SnapshotDiffChange[] | null>(null)

  async function handleRestore(id: number) {
    setBusy(true)
    setError(null)
    try {
      await onRestore(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '還原失敗')
    } finally {
      setBusy(false)
    }
  }

  async function handleDiff() {
    if (!aId || !bId) return
    setBusy(true)
    setError(null)
    try {
      const r = await onDiff(Number(aId), Number(bId))
      setDiff(r.changes)
    } catch (e) {
      setError(e instanceof Error ? e.message : '比對失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="版本歷史" onClose={onClose} className="max-w-2xl">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-orange-50 px-4 py-2 text-sm text-orange-700">{error}</div>
        )}

        {snapshots.length === 0 && (
          <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-gray-500">
            尚無快照
          </div>
        )}

        {snapshots.length > 0 && (
          <ul className="space-y-2">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-md border border-gray-200 p-2"
              >
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {s.version_number}
                </span>
                <span className="flex-1 text-sm text-gray-700">{s.name}</span>
                <span className="text-xs text-gray-400">{s.created_at}</span>
                <Button
                  variant="outline"
                  onClick={() => handleRestore(s.id)}
                  disabled={busy}
                  className="px-2 py-1 text-xs"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> 還原
                </Button>
              </li>
            ))}
          </ul>
        )}

        {snapshots.length >= 2 && (
          <div className="rounded-md border border-gray-200 p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">版本比對（Diff）</div>
            <div className="flex items-center gap-2">
              <select value={aId} onChange={(e) => setAId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                <option value="">選擇版本 A</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{s.version_number} - {s.name}</option>
                ))}
              </select>
              <span className="text-gray-400">vs</span>
              <select value={bId} onChange={(e) => setBId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                <option value="">選擇版本 B</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{s.version_number} - {s.name}</option>
                ))}
              </select>
              <Button variant="outline" onClick={handleDiff} disabled={busy || !aId || !bId} className="px-2 py-1 text-xs">
                <GitCompareArrows className="mr-1 h-3.5 w-3.5" /> 比對
              </Button>
            </div>
            {diff && (
              <div className="mt-3">
                {diff.length === 0 ? (
                  <div className="text-sm text-gray-500">兩版本無差異</div>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {diff.map((c, i) => (
                      <li key={i} className="rounded bg-yellow-50 px-2 py-1">
                        {c.employee_name ?? `員工#${c.employee_id}`} {c.day} 日：{c.old_shift ?? '—'} → {c.new_shift ?? '—'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </div>
      </div>
    </Modal>
  )
}
