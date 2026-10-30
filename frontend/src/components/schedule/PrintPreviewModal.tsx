import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, Loader2, Printer, X } from 'lucide-react'
import { Button } from '../ui/button'
import { HolidayNotesModal } from './HolidayNotesModal'
import { getSchedule } from '../../api/schedules'
import { getCrossMonth, type CrossMonthData } from '../../api/crossMonth'
import { getSetting, updateSetting } from '../../api/settings'
import { buildPrintHtml } from '../../utils/printSchedule'
import { getMonthDays } from '../../utils/date'
import { isHousekeeping } from '../../utils/employee'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { OffDate } from '../../utils/offDayMarks'
import type { Employee, LeaveType, MonthScheduleView } from '../../types'

interface PrintPreviewModalProps {
  open: boolean
  year: number
  month: number
  frontView: MonthScheduleView
  employees: Employee[]
  leaveTypes: LeaveType[]
  hotelName: string
  userName: string
  onClose: () => void
}

function prevMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1]
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

function parseMonthNotes(raw: string): Record<number, string> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const notes: Record<number, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const day = Number(key)
      if (!Number.isInteger(day) || day < 1 || day > 31) continue
      if (typeof value !== 'string' || !value.trim()) continue
      notes[day] = value.trim()
    }
    return notes
  } catch {
    return {}
  }
}

const PREV_LINK_KEYS = [
  'day_6_shift',
  'day_5_shift',
  'day_4_shift',
  'day_3_shift',
  'day_2_shift',
  'day_1_shift',
] as const

/**
 * 上月班表不存在時，用「跨月設定」的上月末休假補足第一週的斜線/交叉順序。
 * 若上月已有實際班表，以上月班表為準，避免兩份資料不一致。
 */
function buildPreviousMonthOffDates(
  links: CrossMonthData['previous_month_links'] | null,
  employees: Employee[],
  year: number,
  month: number,
  prevView: MonthScheduleView | undefined,
): Record<string, OffDate[]> {
  if (!links) return {}
  const [py, pm] = prevMonth(year, month)
  const prevDays = getMonthDays(py, pm)
  const lastSixDays = PREV_LINK_KEYS.map((_, i) => prevDays - 5 + i)
  const result: Record<string, OffDate[]> = {}

  for (const emp of employees) {
    const prevRow = prevView?.schedule?.[emp.name]
    // 只看上月末 6 天（第一週最多會用到 6 天）。
    const hasPrevData = prevRow
      ?.slice(Math.max(0, prevRow.length - 6))
      .some((s) => s && s !== 'EMPTY')
    if (hasPrevData) continue

    const link = links[String(emp.id)]
    if (!link) continue
    const dates: OffDate[] = []
    PREV_LINK_KEYS.forEach((key, i) => {
      if (link[key] === 'OFF') {
        dates.push({ year: py, month: pm, day: lastSixDays[i] })
      }
    })
    if (dates.length > 0) result[emp.name] = dates
  }
  return result
}

const checkboxClass = 'mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600'

function OptionRow({
  checked,
  onChange,
  disabled,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title: string
  description?: string
}) {
  return (
    <label className={`flex items-start gap-2.5 rounded-md border border-gray-200 p-2.5 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800">{title}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{description}</span>}
      </span>
    </label>
  )
}

export function PrintPreviewModal({
  open,
  year,
  month,
  frontView,
  employees,
  leaveTypes,
  hotelName,
  userName,
  onClose,
}: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // 焦點留在預覽對話框內；Esc 與背景捲動由本元件自己的 effect 處理。
  useFocusTrap(dialogRef, open, undefined, { lockScroll: false })
  // xlsx 為整週檢視（含前後月補齊），預設開啟。
  const [wholeWeek, setWholeWeek] = useState(true)
  // xlsx 預設含房務；沒有房務人員時仍會自動忽略。
  const [includeHousekeeping, setIncludeHousekeeping] = useState(() =>
    employees.some((e) => isHousekeeping(e)),
  )
  const [showManagerM, setShowManagerM] = useState(false)
  const [showHolidayRow, setShowHolidayRow] = useState(true)
  const [showWeekendTint, setShowWeekendTint] = useState(false)
  const [includeOccupancyRow, setIncludeOccupancyRow] = useState(true)

  const [frontNeighbors, setFrontNeighbors] = useState<MonthScheduleView[]>([])
  const [housekeepingView, setHousekeepingView] = useState<MonthScheduleView | null>(null)
  const [housekeepingNeighbors, setHousekeepingNeighbors] = useState<MonthScheduleView[]>([])
  const [previousMonthOffDates, setPreviousMonthOffDates] = useState<Record<string, OffDate[]>>({})

  const [branchName, setBranchName] = useState('')
  const [notesText, setNotesText] = useState('')
  const [monthNotes, setMonthNotes] = useState<Record<number, string>>({})
  const [holidayEditorOpen, setHolidayEditorOpen] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const hasHousekeeping = employees.some((e) => isHousekeeping(e))

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSaveError(null)
    setPreviewReady(false)

    const [py, pm] = prevMonth(year, month)
    const [ny, nm] = nextMonth(year, month)

    Promise.all([
      getSchedule(py, pm, 'front'),
      getSchedule(ny, nm, 'front'),
      getSchedule(year, month, 'housekeeping'),
      getSchedule(py, pm, 'housekeeping'),
      getSchedule(ny, nm, 'housekeeping'),
      getSetting('branch_name'),
      getSetting('print_notes'),
      getSetting(`month_notes:${year}:${month}`),
      getCrossMonth(year, month).catch(() => null),
    ])
      .then(([pf, nf, hk, phk, nhk, branch, notes, rawMonthNotes, crossMonth]) => {
        if (cancelled) return
        setFrontNeighbors([pf, nf])
        setHousekeepingView(hk)
        setHousekeepingNeighbors([phk, nhk])
        setBranchName(branch)
        setNotesText(notes)
        setMonthNotes(parseMonthNotes(rawMonthNotes))
        setPreviousMonthOffDates(
          buildPreviousMonthOffDates(
            crossMonth?.previous_month_links ?? null,
            employees,
            year,
            month,
            pf,
          ),
        )
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '載入列印資料失敗')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, year, month, reloadKey, employees])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || holidayEditorOpen) return
      onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, holidayEditorOpen, onClose])

  const html = useMemo(() => {
    if (!open) return ''
    return buildPrintHtml({
      frontView,
      housekeepingView,
      frontNeighborViews: frontNeighbors,
      housekeepingNeighborViews: housekeepingNeighbors,
      previousMonthOffDates,
      employees,
      leaveTypes,
      hotelName,
      branchName,
      userName,
      wholeWeek,
      includeHousekeeping: includeHousekeeping && hasHousekeeping,
      managerBlank: !showManagerM,
      holidayNotes: showHolidayRow ? monthNotes : {},
      notesText,
      showWeekendTint,
      includeOccupancyRow,
    })
  }, [
    open,
    frontView,
    housekeepingView,
    frontNeighbors,
    housekeepingNeighbors,
    previousMonthOffDates,
    employees,
    leaveTypes,
    hotelName,
    branchName,
    userName,
    wholeWeek,
    includeHousekeeping,
    hasHousekeeping,
    showManagerM,
    showHolidayRow,
    monthNotes,
    notesText,
    showWeekendTint,
    includeOccupancyRow,
  ])

  function handlePrint() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  async function saveSetting(key: string, value: string) {
    try {
      await updateSetting(key, value)
      setSaveError(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存設定失敗')
    }
  }

  async function handleSaveMonthNotes(notes: Record<number, string>) {
    await updateSetting(`month_notes:${year}:${month}`, JSON.stringify(notes))
    setMonthNotes(notes)
    setSaveError(null)
  }

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col bg-gray-100"
      role="dialog"
      aria-modal="true"
      aria-label={`列印預覽 ${year} 年 ${month} 月班表`}
      tabIndex={-1}
    >
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-800">列印預覽 — {year} 年 {month} 月班表</h2>
          <p className="text-xs text-gray-500">A4 橫式；月底休假斜線／交叉會依前後月自動判斷</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" /> 取消
          </Button>
          <Button onClick={handlePrint} disabled={loading || !previewReady}>
            <Printer className="mr-2 h-4 w-4" /> 列印／存 PDF
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 flex-shrink-0 overflow-auto border-r border-gray-200 bg-white p-4">
          <div className="space-y-2.5">
            <OptionRow
              checked={wholeWeek}
              onChange={setWholeWeek}
              title="整週模式（週一～週日）"
              description="往前補到當月 1 日所屬週的週一、往後補到月底所屬週的週日。"
            />
            <OptionRow
              checked={includeHousekeeping}
              onChange={setIncludeHousekeeping}
              disabled={!hasHousekeeping}
              title="顯示房務班表"
              description={hasHousekeeping ? '同頁加印房務人員。' : '目前沒有房務人員。'}
            />
            <OptionRow
              checked={showHolidayRow}
              onChange={setShowHolidayRow}
              title="節日／備註列"
              description="在日期列上方顯示元旦、尾牙、主會等文字。"
            />
            <OptionRow
              checked={showManagerM}
              onChange={setShowManagerM}
              title="主管班顯示 M"
              description="預設留白（空白＝M 主管班 09:00-17:00）。"
            />
            <OptionRow
              checked={showWeekendTint}
              onChange={setShowWeekendTint}
              title="週末淺灰底"
              description="xlsx 原版沒有灰底；需要螢幕辨識時再開。"
            />
            <OptionRow
              checked={includeOccupancyRow}
              onChange={setIncludeOccupancyRow}
              title="新訂加續住空白列"
              description="保留手寫列，之後可再改成系統資料。"
            />
          </div>

          <div className="mt-4 space-y-2 border-t border-gray-200 pt-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">分館名稱（抬頭第二行）</span>
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onBlur={() => saveSetting('branch_name', branchName.trim())}
                placeholder="例：板橋府中店(一館)"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">頁尾注意事項</span>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                onBlur={() => saveSetting('print_notes', notesText)}
                rows={5}
                className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </label>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setHolidayEditorOpen(true)}
            >
              <CalendarPlus className="mr-2 h-4 w-4" /> 編輯節日／備註
            </Button>
          </div>

          {saveError && (
            <div className="mt-3 rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-600">{saveError}</div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
            列印時請選擇 A4、橫向。主管班空白會在頁尾圖例說明；休假格只畫線、不顯示「休」字。
          </p>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex h-full min-h-[400px] items-center justify-center text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 載入列印資料…
            </div>
          )}

          {!loading && error && (
            <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center">
              <p className="mb-3 text-sm text-red-700">載入失敗：{error}</p>
              <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                重試
              </Button>
            </div>
          )}

          {!loading && !error && (
            <iframe
              ref={iframeRef}
              title="班表列印預覽"
              srcDoc={html}
              onLoad={() => setPreviewReady(true)}
              className="h-full min-h-[600px] w-full rounded-md border border-gray-300 bg-white shadow-sm"
            />
          )}
        </main>
      </div>

      <HolidayNotesModal
        open={holidayEditorOpen}
        year={year}
        month={month}
        numDays={frontView.num_days}
        value={monthNotes}
        onClose={() => setHolidayEditorOpen(false)}
        onSave={handleSaveMonthNotes}
      />
    </div>
  )
}
