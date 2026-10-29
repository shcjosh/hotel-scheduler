import { useRef, useState } from 'react'
import { Ellipsis, History, Lock, LockOpen, RefreshCw, Trash2 } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
import { cn } from '../../utils/cn'
import type { ScheduleStatus } from '../../types'

interface ScheduleActionsMenuProps {
  status: ScheduleStatus
  canAdjust: boolean
  /** 房務沒有大夜，不顯示清空大夜。 */
  showNightActions?: boolean
  onOpenVersions: () => void
  onOpenAdjust: () => void
  onClear: () => void
  onClearNight: () => void
  onToggleLock: () => void
}

/** 次要動作都收進「⋯」，破壞性操作一律走確認對話框。 */
export function ScheduleActionsMenu({
  status,
  canAdjust,
  showNightActions = true,
  onOpenVersions,
  onOpenAdjust,
  onClear,
  onClearNight,
  onToggleLock,
}: ScheduleActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  const locked = status === 'locked'

  function item(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="更多動作"
        title="更多動作"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      >
        <Ellipsis className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-popover"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => item(onOpenVersions)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <History className="h-4 w-4 text-slate-400" /> 版本歷史
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => item(onOpenAdjust)}
            disabled={!canAdjust}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40',
              'text-slate-700',
            )}
          >
            <RefreshCw className="h-4 w-4 text-slate-400" /> 臨時異動
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => item(onToggleLock)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            {locked ? (
              <LockOpen className="h-4 w-4 text-slate-400" />
            ) : (
              <Lock className="h-4 w-4 text-slate-400" />
            )}
            {locked ? '解鎖本月' : '鎖定本月'}
          </button>

          <div className="my-1 h-px bg-slate-100" role="separator" />

          <button
            type="button"
            role="menuitem"
            disabled={locked}
            onClick={() => item(onClear)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> 清空當月班表
          </button>
          {showNightActions && (
            <button
              type="button"
              role="menuitem"
              disabled={locked}
              onClick={() => item(onClearNight)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> 清空大夜排班
            </button>
          )}
        </div>
      )}
    </div>
  )
}
