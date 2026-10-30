import { useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_GROUPS } from '../../config/navigation'
import { useUIStore } from '../../stores/uiStore'
import { getHealth } from '../../api/health'
import { getScheduleStatus } from '../../api/scheduleMeta'
import { Badge } from '../ui/badge'
import { statusLabel } from '../../utils/scheduleStatus'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { cn } from '../../utils/cn'
import type { ScheduleStatus } from '../../types'

const STATUS_BADGE_TONE = {
  draft: 'warning',
  published: 'success',
  locked: 'neutral',
} as const

const STATUS_DOT = {
  draft: 'bg-amber-500',
  published: 'bg-emerald-500',
  locked: 'bg-slate-400',
} as const

function useMonthStatus(): ScheduleStatus | undefined {
  const { currentYear, currentMonth } = useUIStore()
  const { data } = useQuery({
    queryKey: ['schedule-status', currentYear, currentMonth],
    queryFn: () => getScheduleStatus(currentYear, currentMonth),
    staleTime: 30_000,
    retry: 0,
  })
  return data?.status
}

function NavContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const status = useMonthStatus()

  return (
    <nav className="hs-scroll flex-1 space-y-4 overflow-y-auto p-2" aria-label="主選單">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              'px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400',
              collapsed && 'sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon
              const showBadge = item.badge === 'schedule-status' && status
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-2.5',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {showBadge &&
                      (collapsed ? (
                        <span
                          className={cn(
                            'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
                            STATUS_DOT[status],
                          )}
                          aria-label={`班表狀態：${statusLabel(status)}`}
                        />
                      ) : (
                        <Badge tone={STATUS_BADGE_TONE[status]}>{statusLabel(status)}</Badge>
                      ))}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function MobileNav({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  useFocusTrap(panelRef, true, onClose)

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="主選單"
        tabIndex={-1}
        className="relative flex h-full w-64 max-w-[80%] flex-col bg-white shadow-drawer outline-none"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <span className="font-semibold text-slate-800">飯店排班</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉選單"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavContent collapsed={false} onNavigate={onClose} />
      </aside>
    </div>
  )
}

export function Sidebar() {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
  } = useUIStore()
  const { data } = useQuery({ queryKey: ['health'], queryFn: () => getHealth() })

  return (
    <>
      <aside
        className={cn(
          'hidden h-full flex-col border-r border-slate-200 bg-white transition-[width] duration-150 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-[220px]',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center gap-2 border-b border-slate-200',
            sidebarCollapsed ? 'justify-center' : 'px-4',
          )}
        >
          <CalendarDays className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          {!sidebarCollapsed && (
            <span className="truncate font-semibold text-slate-800">飯店排班</span>
          )}
        </div>

        <NavContent collapsed={sidebarCollapsed} />

        <div className={cn('border-t border-slate-200 py-2', sidebarCollapsed ? 'px-1' : 'px-3')}>
          <div
            className={cn(
              'flex items-center',
              sidebarCollapsed ? 'justify-center' : 'justify-between',
            )}
          >
            {!sidebarCollapsed && (
              <span className="text-[11px] text-slate-400">v{data?.version ?? '…'}</span>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? '展開側欄' : '收合側欄'}
              aria-expanded={!sidebarCollapsed}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <MobileNav onClose={() => setMobileNavOpen(false)} />}
    </>
  )
}
