import { useState } from 'react'
import { GitCompareArrows, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { LoadingState } from '../ui/loading-state'
import type { ScheduleSnapshot, SnapshotDiffChange } from '../../api/scheduleMeta'
import type { Employee } from '../../types'
import { nameMap } from '../../utils/employee'

interface VersionHistoryPanelProps {
  snapshots: ScheduleSnapshot[]
  isLoading?: boolean
  employees: Employee[]
  onRestore: (id: number) => Promise<void>
  onDiff: (aId: number, bId: number) => Promise<{ changes: SnapshotDiffChange[] }>
  readOnly?: boolean
}

/** 版本歷史內容（放在 ScheduleSidePanel 的「版本」分頁）。 */
export function VersionHistoryPanel({
  snapshots,
  isLoading = false,
  employees,
  onRestore,
  onDiff,
  readOnly = false,
}: VersionHistoryPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [diff, setDiff] = useState<SnapshotDiffChange[] | null>(null)

  const names = nameMap(employees)

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
      const result = await onDiff(Number(aId), Number(bId))
      setDiff(result.changes)
    } catch (e) {
      setError(e instanceof Error ? e.message : '比對失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {isLoading && <LoadingState label="載入版本…" />}

      {!isLoading && snapshots.length === 0 && (
        <EmptyState title="尚無版本" description="發布班表或執行排班時會自動建立版本快照" />
      )}

      {snapshots.length > 0 && (
        <ul className="space-y-2">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 p-2"
            >
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {snapshot.version_number}
              </span>
              <span className="flex-1 text-sm text-slate-700">{snapshot.name}</span>
              <span className="text-xs text-slate-400">{snapshot.created_at}</span>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(snapshot.id)}
                  disabled={busy}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> 還原
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {snapshots.length >= 2 && (
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">版本比對（Diff）</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={aId}
              onChange={(event) => setAId(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">選擇版本 A</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.version_number} - {snapshot.name}
                </option>
              ))}
            </select>
            <span className="text-slate-400">vs</span>
            <select
              value={bId}
              onChange={(event) => setBId(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">選擇版本 B</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.version_number} - {snapshot.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiff}
              disabled={busy || !aId || !bId}
            >
              <GitCompareArrows className="mr-1 h-3.5 w-3.5" /> 比對
            </Button>
          </div>
          {diff && (
            <div className="mt-3">
              {diff.length === 0 ? (
                <div className="text-sm text-slate-500">兩版本無差異</div>
              ) : (
                <ul className="space-y-1 text-xs">
                  {diff.map((change, index) => (
                    <li key={index} className="rounded bg-amber-50 px-2 py-1">
                      {change.employee_name
                        ? (names.get(change.employee_name) ?? change.employee_name)
                        : `員工#${change.employee_id}`}{' '}
                      {change.day} 日：{change.old_shift ?? '—'} → {change.new_shift ?? '—'}
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
