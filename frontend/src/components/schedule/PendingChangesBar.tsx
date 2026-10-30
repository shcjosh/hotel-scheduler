import { CheckCheck, Redo2, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../ui/button'

interface PendingChangesBarProps {
  count: number
  canUndo: boolean
  canRedo: boolean
  applying?: boolean
  /** front = 先驗證再套用；housekeeping = 直接套用（不做規則檢測）。 */
  mode: 'check' | 'direct'
  onUndo: () => void
  onRedo: () => void
  onDiscard: () => void
  onApply: () => void
}

/** 暫存修改列：貼在畫面底部，只有真的有暫存時才出現。 */
export function PendingChangesBar({
  count,
  canUndo,
  canRedo,
  applying = false,
  mode,
  onUndo,
  onRedo,
  onDiscard,
  onApply,
}: PendingChangesBarProps) {
  if (count === 0) return null

  return (
    <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white/95 px-3 py-2 shadow-popover backdrop-blur">
      <span className="text-xs font-semibold text-brand-800">已暫存 {count} 處修改</span>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="復原（Ctrl+Z）"
        >
          <Undo2 className="mr-1 h-3.5 w-3.5" /> 復原
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="重做（Ctrl+Shift+Z）"
        >
          <Redo2 className="mr-1 h-3.5 w-3.5" /> 重做
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> 放棄
        </Button>
        <Button size="sm" onClick={onApply} loading={applying}>
          <CheckCheck className="mr-1 h-3.5 w-3.5" />
          {mode === 'check' ? '檢查並套用' : '套用'}
        </Button>
      </div>
    </div>
  )
}
