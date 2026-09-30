import type { Employee, LeaveType, MonthScheduleView } from '../types'
import { getMonthDays, getWeekday, getWeekdayLabel } from './date'
import { SHIFT_ORDER, SHIFT_DESCRIPTIONS, getDesignatedOffStyle } from './shift'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cellText(shift: string, source: string, leaveName?: string): string {
  if (shift === 'EMPTY' || !shift) return ''
  if (shift === 'OFF') return source === 'designated' ? '指定' : '休'
  if (shift === 'SPECIAL') {
    if (!leaveName) return '假'
    return leaveName.length > 2 ? leaveName.slice(0, 2) : leaveName
  }
  return shift
}

const PRINT_SHIFT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: '#e3f2fd', text: '#1e40af', label: 'A' },
  B: { bg: '#fff3e0', text: '#9a3412', label: 'B' },
  C: { bg: '#f3e5f5', text: '#6b21a8', label: 'C' },
  D: { bg: '#1a237e', text: '#ffffff', label: 'D' },
  M: { bg: '#ccfbf1', text: '#115e59', label: 'M' },
  OFF: { bg: '#ffcdd2', text: '#991b1b', label: '休' },
}

export interface PrintColumn {
  year: number
  month: number
  day: number
  weekday: number
  inMonth: boolean
}

export interface PrintScheduleOptions {
  /** 主月份（櫃台）班表。 */
  frontView: MonthScheduleView
  /** 顯示房務時，主月份房務班表。 */
  housekeepingView?: MonthScheduleView | null
  /** 整週模式下，前後月份（櫃台）班表；未提供則跨月格子留白。 */
  frontNeighborViews?: MonthScheduleView[]
  /** 整週模式下，前後月份（房務）班表。 */
  housekeepingNeighborViews?: MonthScheduleView[]
  employees: Employee[]
  leaveTypes: LeaveType[]
  hotelName: string
  wholeWeek: boolean
  includeHousekeeping: boolean
}

function legendItem(label: string, bg: string, text: string, desc: string): string {
  return `<span class="lg"><span class="sw" style="background:${bg};color:${text}">${esc(label)}</span>${esc(desc)}</span>`
}

export function buildPrintColumns(primary: MonthScheduleView, wholeWeek: boolean): PrintColumn[] {
  const { year, month, num_days: nd } = primary
  if (!wholeWeek) {
    return Array.from({ length: nd }, (_, i) => {
      const day = i + 1
      return { year, month, day, weekday: getWeekday(year, month, day), inMonth: true }
    })
  }
  const firstWeekday = getWeekday(year, month, 1)
  const lead = (firstWeekday + 6) % 7 // 週一起算，往前補到週一
  const lastWeekday = getWeekday(year, month, nd)
  const trail = 6 - ((lastWeekday + 6) % 7) // 往後補到週日
  const [py, pm] = month === 1 ? [year - 1, 12] : [year, month - 1]
  const prevNd = getMonthDays(py, pm)
  const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1]
  const cols: PrintColumn[] = []
  for (let i = lead; i >= 1; i--) {
    const day = prevNd - i + 1
    cols.push({ year: py, month: pm, day, weekday: getWeekday(py, pm, day), inMonth: false })
  }
  for (let d = 1; d <= nd; d++) {
    cols.push({ year, month, day: d, weekday: getWeekday(year, month, d), inMonth: true })
  }
  for (let d = 1; d <= trail; d++) {
    cols.push({ year: ny, month: nm, day: d, weekday: getWeekday(ny, nm, d), inMonth: false })
  }
  return cols
}

function buildViewMap(views: MonthScheduleView[]): Map<string, MonthScheduleView> {
  return new Map(views.map((v) => [`${v.year}-${v.month}`, v]))
}

function renderHeaderRow(cols: PrintColumn[]): string {
  const cells = cols.map((col, idx) => {
    const weekend = col.weekday === 0 || col.weekday === 6
    const weekStart = col.weekday === 1 || idx === 0
    const weekEnd = col.weekday === 0 || idx === cols.length - 1
    const cls = [
      weekend && 'weekend',
      weekStart && 'week-start',
      weekEnd && 'week-end',
      !col.inMonth && 'other-month',
    ].filter(Boolean).join(' ')
    const dayLabel = col.inMonth ? `${col.day}` : `${col.month}/${col.day}`
    return `<th class="${cls}"><div class="day">${dayLabel}</div><div class="wk">${getWeekdayLabel(col.weekday)}</div></th>`
  })
  return `<thead><tr><th class="name">員工</th>${cells.join('')}</tr></thead>`
}

function renderRows(
  cols: PrintColumn[],
  names: string[],
  viewMap: Map<string, MonthScheduleView>,
  nickByName: Map<string, string>,
  leaveNameByCode: Map<string, string>,
): string {
  const rows: string[] = []
  for (const name of names) {
    const label = nickByName.get(name) ?? name
    const cells = cols.map((col, idx) => {
      const weekend = col.weekday === 0 || col.weekday === 6
      const weekStart = col.weekday === 1 || idx === 0
      const weekEnd = col.weekday === 0 || idx === cols.length - 1
      const cls = [
        weekend && 'weekend',
        weekStart && 'week-start',
        weekEnd && 'week-end',
        !col.inMonth && 'other-month',
      ].filter(Boolean).join(' ')
      const view = viewMap.get(`${col.year}-${col.month}`)
      const row = view?.schedule?.[name]
      if (!view || !row) return `<td class="${cls}"></td>`
      const shift = row[col.day - 1] ?? ''
      const source = view.sources?.[name]?.[col.day - 1] ?? ''
      const leaveCode = view.leave_details?.[name]?.[String(col.day)]
      const seq = leaveCode === 'SPECIAL' ? view.leave_sequence?.[name]?.[String(col.day)] : undefined
      const text = seq != null
        ? `特${seq}`
        : cellText(shift, source, leaveCode ? leaveNameByCode.get(leaveCode) : undefined)
      return `<td class="${cls}">${esc(text)}</td>`
    })
    rows.push(`<tr><td class="name">${esc(label)}</td>${cells.join('')}</tr>`)
  }
  return `<tbody>${rows.join('')}</tbody>`
}

function rangeLabel(cols: PrintColumn[]): string {
  if (cols.length === 0) return ''
  const first = cols[0]
  const last = cols[cols.length - 1]
  return `${first.month}/${first.day} ~ ${last.month}/${last.day}`
}

export function printSchedule(opts: PrintScheduleOptions): void {
  const {
    frontView,
    housekeepingView,
    frontNeighborViews = [],
    housekeepingNeighborViews = [],
    employees,
    leaveTypes,
    hotelName,
    wholeWeek,
    includeHousekeeping,
  } = opts

  const { year, month } = frontView
  const cols = buildPrintColumns(frontView, wholeWeek)
  const frontMap = buildViewMap([frontView, ...frontNeighborViews])
  const hkMap = housekeepingView
    ? buildViewMap([housekeepingView, ...housekeepingNeighborViews])
    : new Map<string, MonthScheduleView>()

  const nickByName = new Map(employees.map((e) => [e.name, e.nickname || e.name]))
  const leaveNameByCode = new Map(leaveTypes.map((lt) => [lt.code, lt.name]))

  const frontNames = Object.keys(frontView.schedule)
  const hkNames = housekeepingView ? Object.keys(housekeepingView.schedule) : []

  const frontTable = frontNames.length
    ? `<table>${renderHeaderRow(cols)}${renderRows(cols, frontNames, frontMap, nickByName, leaveNameByCode)}</table>`
    : '<p class="empty">（本月尚無櫃台班表）</p>'
  const hkTable = hkNames.length
    ? `<table>${renderHeaderRow(cols)}${renderRows(cols, hkNames, hkMap, nickByName, leaveNameByCode)}</table>`
    : '<p class="empty">（本月尚無房務班表）</p>'

  const legendItems: string[] = []
  for (const s of SHIFT_ORDER) {
    if (s === 'SPECIAL') continue
    const c = PRINT_SHIFT_COLORS[s]
    legendItems.push(legendItem(c.label, c.bg, c.text, SHIFT_DESCRIPTIONS[s]))
  }
  const designated = getDesignatedOffStyle()
  legendItems.push(legendItem(designated.label, designated.bg, designated.text, '指定休假'))
  for (const lt of leaveTypes) {
    const name = lt.name || '假'
    const label = name.length > 2 ? name.slice(0, 2) : name
    legendItems.push(legendItem(label, lt.color_bg ?? '#e1bee7', lt.color_text ?? '#4a148c', name))
  }

  const title = `${hotelName} ${year} 年 ${month} 月班表`
  const rangeNote = wholeWeek ? `<div class="range">整週檢視：${rangeLabel(cols)}</div>` : ''

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 4px; font-weight: 600; }
  .range { text-align: center; font-size: 9px; color: #6b7280; margin-bottom: 6px; }
  .section { margin-bottom: 10px; }
  .caption { font-size: 11px; font-weight: 600; margin: 0 0 4px; }
  .empty { font-size: 9px; color: #9ca3af; margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #9ca3af; text-align: center; font-size: 9px; padding: 2px 0; }
  .name { font-weight: 600; width: 44px; }
  .day { font-weight: 600; }
  .wk { color: #9ca3af; font-size: 8px; }
  .weekend { background: #e5e7eb; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .other-month { background: #f8fafc; color: #9ca3af; }
  .week-start { border-left: 2px solid #111827; }
  .week-end { border-right: 2px solid #111827; }
  .legend { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: 8px; }
  .lg { display: inline-flex; align-items: center; gap: 3px; }
  .sw { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 12px; border-radius: 2px; font-size: 7px; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${rangeNote}
<div class="section">
  <div class="caption">櫃台班表</div>
  ${frontTable}
</div>
${includeHousekeeping ? `<div class="section">
  <div class="caption">房務班表（A 09:00-18:00，含 1 小時用餐）</div>
  ${hkTable}
</div>` : ''}
<div class="legend">${legendItems.join('')}</div>
<script>window.onload = function () { window.print(); }</script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
}
