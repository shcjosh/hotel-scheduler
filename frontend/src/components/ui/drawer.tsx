import { useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface DrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** 面板寬度 class，預設 max-w-md。 */
  widthClassName?: string
  description?: ReactNode
  footer?: ReactNode
}

/**
 * 右側抽屜。與 Modal 共用焦點管理（Esc、focus trap、鎖背景捲動）。
 * Phase 2 起驗證／支援／大夜／版本會搬進此面板。
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  widthClassName = 'max-w-md',
  description,
  footer,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useFocusTrap(panelRef, open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full flex-col bg-white shadow-drawer outline-none',
          widthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-800">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="hs-scroll flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
