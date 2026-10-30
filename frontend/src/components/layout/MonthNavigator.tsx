import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { MAX_YEAR, MIN_YEAR, useUIStore } from '../../stores/uiStore'
import { getScheduleStatus } from '../../api/scheduleMeta'
import { StatusPill } from '../ui/status-pill'
import { cn } from '../../utils/cn'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i)

/**
 * 月份導覽：‹ 2026 年 10 月 › + 本月。
 * 點月份標籤可展開年/月選單（保留原本快速跳月的習慣）。
 */
export function MonthNavigator({ showStatus = true }: { showStatus?: boolean }) {
  const { currentYear, currentMonth, shiftMonth, goToCurrentMonth, setCurrentYear, setCurrentMonth } =
    useUIStore()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const { data: statusData } = useQuery({
    queryKey: ['schedule-status', currentYear, currentMonth],
    queryFn: () => getScheduleStatus(currentYear, currentMonth),
    staleTime: 30_000,
    retry: 0,
  })

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const canGoPrev = !(currentYear === MIN_YEAR && currentMonth === 1)
  const canGoNext = !(currentYear === MAX_YEAR && currentMonth === 12)

  return (
    <div className="flex items-center gap-1" ref={popoverRef}>
      <button
        type="button"
        onClick={() => shiftMonth(-1)}
        disabled={!canGoPrev}
        aria-label="上一個月"
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
          title="選擇年月"
        >
          <CalendarDays className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
          {currentYear} 年 {currentMonth} 月
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="選擇年月"
            className="absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-popover"
          >
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500">
                年份
                <select
                  value={currentYear}
                  onChange={(event) => setCurrentYear(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year} 年
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-500">
                月份
                <select
                  value={currentMonth}
                  onChange={(event) => setCurrentMonth(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                >
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {month} 月
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => shiftMonth(1)}
        disabled={!canGoNext}
        aria-label="下一個月"
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={goToCurrentMonth}
        title="回到今天所在的月份"
        className="hidden rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:inline-flex"
      >
        本月
      </button>

      {showStatus && statusData && (
        <StatusPill status={statusData.status} size="sm" className={cn('ml-0.5')} />
      )}
    </div>
  )
}
