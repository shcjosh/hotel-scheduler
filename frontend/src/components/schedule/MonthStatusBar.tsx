import { AlertTriangle, CalendarClock, CheckCircle2, LifeBuoy, PackageCheck } from 'lucide-react'
import { StatusPill } from '../ui/status-pill'
import { cn } from '../../utils/cn'
import type { ScheduleStatus } from '../../types'
import type { ScheduleGroup } from '../../utils/brush'

export type SidePanelTab = 'validation' | 'support' | 'night' | 'version'

interface MonthStatusBarProps {
  status: ScheduleStatus
  group: ScheduleGroup
  hardViolations: number
  softWarnings: number
  openSupports: number
  version: string | null
  onOpenTab: (tab: SidePanelTab) => void
}

function Chip({
  icon: Icon,
  label,
  tone = 'neutral',
  onClick,
  title,
}: {
  icon: typeof CheckCircle2
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
  onClick?: () => void
  title?: string
}) {
  const toneClass = {
    neutral: 'text-slate-600 hover:bg-slate-100',
    success: 'text-emerald-700 hover:bg-emerald-50',
    warning: 'text-amber-700 hover:bg-amber-50',
    danger: 'text-red-700 hover:bg-red-50',
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors',
        toneClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  )
}

/** 本月狀態列：狀態｜違規｜支援｜版本（點擊開右側抽屜）。 */
export function MonthStatusBar({
  status,
  group,
  hardViolations,
  softWarnings,
  openSupports,
  version,
  onOpenTab,
}: MonthStatusBarProps) {
  const isFront = group === 'front'
  const violationsClean = hardViolations === 0

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-card">
      <StatusPill status={status} size="sm" />
      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

      {isFront ? (
        <>
          <Chip
            icon={violationsClean ? CheckCircle2 : AlertTriangle}
            label={
              violationsClean
                ? softWarnings > 0
                  ? `0 違規／${softWarnings} 警告`
                  : '無違規'
                : `${hardViolations} 違規／${softWarnings} 警告`
            }
            tone={violationsClean ? (softWarnings > 0 ? 'warning' : 'success') : 'danger'}
            onClick={() => onOpenTab('validation')}
            title="開啟規則驗證"
          />
          <Chip
            icon={LifeBuoy}
            label={openSupports > 0 ? `支援 ${openSupports} 件待處理` : '無待處理支援'}
            tone={openSupports > 0 ? 'warning' : 'neutral'}
            onClick={() => onOpenTab('support')}
            title="開啟支援請求"
          />
          <Chip
            icon={CalendarClock}
            label="大夜"
            onClick={() => onOpenTab('night')}
            title="開啟大夜／D 班備援"
          />
        </>
      ) : (
        <span className="px-1 text-slate-500">房務班表：手動排班，不做規則檢測</span>
      )}

      <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
      <Chip
        icon={PackageCheck}
        label={version ? `版本 ${version}` : '尚無版本'}
        onClick={() => onOpenTab('version')}
        title="開啟版本歷史"
      />
    </div>
  )
}
