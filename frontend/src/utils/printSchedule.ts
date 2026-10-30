import type { Employee, LeaveType, MonthScheduleView } from '../types'
import { getMonthDays, getWeekday, getWeekdayLabel } from './date'
import { buildOffIndexByEmployee, isoDate, type OffDate } from './offDayMarks'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cellText(
  shift: string,
  leaveCode: string | null,
  leaveName?: string,
  sequence?: number,
): string {
  if (!shift || shift === 'EMPTY' || shift === 'OFF') return ''
  if (shift !== 'SPECIAL') return shift
  if (sequence != null) return `特${sequence}`
  switch (leaveCode) {
    case 'SPECIAL':
      return '特'
    case 'PERSONAL':
      return '事'
    case 'SICK':
      return '病'
  }
  if (!leaveName) return '假'
  return leaveName.length > 2 ? leaveName.slice(0, 2) : leaveName
}

function printName(employee: Employee | undefined, fallback: string): string {
  if (!employee) return fallback
  return employee.nickname ? `${employee.name} ${employee.nickname}` : employee.name
}

function roleTag(employee: Employee | undefined): string {
  if (!employee) return ''
  if (employee.tag) return employee.tag
  switch (employee.role) {
    case 'manager':
      return '店長'
    case 'night':
      return '大夜'
    case 'cd_backup':
      return 'C+D'
    default:
      return ''
  }
}

function shortLeaveLabel(code: string, name: string): string {
  if (code === 'SPECIAL') return '特N'
  if (code === 'PERSONAL') return '事'
  if (code === 'SICK') return '病'
  return name.length > 2 ? name.slice(0, 2) : name
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback
}

const SHIFT_TIMES: Record<string, string> = {
  A: '07:30-15:30',
  B: '11:30-19:30',
  C: '15:30-23:30',
  D: '23:30-07:30',
  M: '09:00-17:00',
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
  /** 是否加印「每人上班／休假統計」（只算本月、含房務、排除二館支援）。 */
  includeStats?: boolean
  /** 前後月份（櫃台）班表；用來判斷跨月週的休假日順序。 */
  frontNeighborViews?: MonthScheduleView[]
  /** 前後月份（房務）班表。 */
  housekeepingNeighborViews?: MonthScheduleView[]
  /** 上月班表缺失時，用跨月設定的上月末休假補足第一週順序（name -> OFF 日期）。 */
  previousMonthOffDates?: Record<string, OffDate[]>
  employees: Employee[]
  leaveTypes: LeaveType[]
  hotelName: string
  /** 抬頭第二行，例如「板橋府中店(一館)」。 */
  branchName?: string
  /** 製表人。 */
  userName?: string
  wholeWeek: boolean
  includeHousekeeping: boolean
  /** 主管班（M／空白）是否留白。預設 true＝留白。 */
  managerBlank?: boolean
  /** 節日／備註：day -> 文字。 */
  holidayNotes?: Record<number, string>
  /** 頁尾注意事項，一行一條。 */
  notesText?: string
  /** 週末是否加淺灰底（xlsx 預設無）。 */
  showWeekendTint?: boolean
  /** 是否加印「新訂加續住」手寫列。 */
  includeOccupancyRow?: boolean
}

export function buildPrintColumns(
  primary: MonthScheduleView,
  wholeWeek: boolean,
): PrintColumn[] {
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

function dayClass(
  col: PrintColumn,
  index: number,
  cols: PrintColumn[],
  showWeekendTint: boolean,
): string {
  const cls: string[] = []
  if (col.weekday === 1 || index === 0) cls.push('week-start')
  if (col.weekday === 0 || index === cols.length - 1) cls.push('week-end')
  if (showWeekendTint && (col.weekday === 0 || col.weekday === 6)) cls.push('weekend')
  if (!col.inMonth) cls.push('other-month')
  return cls.join(' ')
}

function renderHeaderRows(
  cols: PrintColumn[],
  holidayNotes: Record<number, string>,
  showWeekendTint: boolean,
): { html: string; hasHoliday: boolean } {
  const hasHoliday = cols.some(
    (col) => col.inMonth && (holidayNotes[col.day] ?? '').trim() !== '',
  )

  const rows: string[] = []

  if (hasHoliday) {
    const runs: { label: string; cols: PrintColumn[] }[] = []
    for (const col of cols) {
      const label = col.inMonth ? (holidayNotes[col.day] ?? '').trim() : ''
      const prev = runs[runs.length - 1]
      const prevCol = prev?.cols[prev.cols.length - 1]
      const contiguous =
        prevCol != null &&
        prevCol.year === col.year &&
        prevCol.month === col.month &&
        prevCol.day === col.day - 1
      if (label && prev && prev.label === label && contiguous) {
        prev.cols.push(col)
      } else {
        runs.push({ label, cols: [col] })
      }
    }
    const cells = runs.map((run) => {
      const index = cols.indexOf(run.cols[0])
      return `<th colspan="${run.cols.length}" class="${dayClass(run.cols[0], index, cols, false)}">${esc(run.label)}</th>`
    })
    rows.push(
      `<tr class="holiday-row"><th class="head" colspan="3">節日</th>${cells.join('')}</tr>`,
    )
  }

  const dateCells = cols.map((col, index) => {
    const label = col.inMonth ? String(col.day) : `${col.month}/${col.day}`
    return `<th class="${dayClass(col, index, cols, showWeekendTint)}"><div class="day">${label}</div></th>`
  })
  rows.push(
    `<tr class="date-row"><th class="head name-head" colspan="3" rowspan="2">人員</th>${dateCells.join('')}</tr>`,
  )

  const weekdayCells = cols.map(
    (col, index) =>
      `<th class="${dayClass(col, index, cols, showWeekendTint)}"><div class="wk">${getWeekdayLabel(col.weekday)}</div></th>`,
  )
  rows.push(`<tr class="weekday-row">${weekdayCells.join('')}</tr>`)

  return { html: `<thead>${rows.join('')}</thead>`, hasHoliday }
}

interface PrintRow {
  name: string
  employee?: Employee
}

function buildRows(view: MonthScheduleView, employees: Employee[]): PrintRow[] {
  const byName = new Map(employees.map((e) => [e.name, e]))
  return Object.keys(view.schedule ?? {})
    .map((name) => ({ name, employee: byName.get(name) }))
    .sort((a, b) => {
      const ao = a.employee?.sort_order ?? 9999
      const bo = b.employee?.sort_order ?? 9999
      if (ao !== bo) return ao - bo
      return a.name.localeCompare(b.name, 'zh-Hant')
    })
}

const STATS_WORK_SHIFTS = new Set(['A', 'B', 'C', 'D', 'M', 'A1', 'C1', 'D1'])

export interface PrintStatColumn {
  code: string
  label: string
}

export interface PrintStatRow {
  group: string
  name: string
  displayName: string
  workDays: number
  offDays: number
  leaveCounts: Record<string, number>
}

export interface PrintStatsResult {
  columns: PrintStatColumn[]
  rows: PrintStatRow[]
}

/**
 * 每人上班／休假統計（只算本月）。
 * 上班＝A/B/C/D/M（含房務 A）；休假＝OFF；請假依 leave_details 的假別分開計。
 * 二館支援（任何有 tag 的員工）不列入。
 */
export function buildPrintStats(
  frontView: MonthScheduleView,
  housekeepingView: MonthScheduleView | null | undefined,
  employees: Employee[],
  leaveTypes: LeaveType[],
): PrintStatsResult {
  const usedCodes = new Set<string>()
  const rows: PrintStatRow[] = []

  function collect(group: string, view: MonthScheduleView | null | undefined) {
    if (!view) return
    for (const { name, employee } of buildRows(view, employees)) {
      if (employee?.tag) continue
      const scheduleRow = view.schedule[name] ?? []
      const details = view.leave_details?.[name] ?? {}
      let workDays = 0
      let offDays = 0
      const leaveCounts: Record<string, number> = {}
      for (let d = 0; d < view.num_days; d++) {
        const shift = scheduleRow[d] ?? ''
        if (STATS_WORK_SHIFTS.has(shift)) {
          workDays += 1
        } else if (shift === 'OFF') {
          offDays += 1
        } else if (shift === 'SPECIAL') {
          const code = details[String(d + 1)] ?? 'SPECIAL'
          leaveCounts[code] = (leaveCounts[code] ?? 0) + 1
          usedCodes.add(code)
        }
      }
      rows.push({
        group,
        name,
        displayName: printName(employee, name),
        workDays,
        offDays,
        leaveCounts,
      })
    }
  }

  collect('櫃台', frontView)
  collect('房務', housekeepingView)

  const labelByCode = new Map(leaveTypes.map((lt) => [lt.code, lt.name]))
  const orderedCodes = [
    ...leaveTypes.map((lt) => lt.code).filter((code) => usedCodes.has(code)),
    ...[...usedCodes].filter((code) => !labelByCode.has(code)),
  ]
  const columns = orderedCodes.map((code) => ({
    code,
    label:
      labelByCode.get(code) ??
      (code === 'SPECIAL' ? '特休' : code === 'PERSONAL' ? '事假' : code === 'SICK' ? '病假' : code),
  }))

  return { columns, rows }
}

function renderStatsTable(stats: PrintStatsResult): string {
  if (stats.rows.length === 0) return ''
  const head = `<tr><th class="st-group">單位</th><th class="st-name">姓名</th><th>上班</th><th>休假</th>${stats.columns
    .map((col) => `<th>${esc(col.label)}</th>`)
    .join('')}</tr>`
  const body = stats.rows
    .map(
      (row) =>
        `<tr><td class="st-group">${esc(row.group)}</td><td class="st-name">${esc(row.displayName)}</td><td>${row.workDays}</td><td>${row.offDays}</td>${stats.columns
          .map((col) => `<td>${row.leaveCounts[col.code] ?? 0}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  return `<div class="stats-block">
  <div class="stats-title">每人上班／休假統計（本月）</div>
  <table class="stats-table"><thead>${head}</thead><tbody>${body}</tbody></table>
</div>`
}

function renderGroupRows(
  groupLabel: string,
  rows: PrintRow[],
  cols: PrintColumn[],
  viewMap: Map<string, MonthScheduleView>,
  offIndexByEmployee: Map<string, Map<string, number>>,
  leaveNameByCode: Map<string, string>,
  managerNames: Set<string>,
  managerBlank: boolean,
  showWeekendTint: boolean,
): string {
  if (rows.length === 0) return ''

  return rows
    .map(({ name, employee }, rowIndex) => {
      const isManager = managerNames.has(name)
      const offIndex = offIndexByEmployee.get(name)
      const cells = cols.map((col, index) => {
        const cls = dayClass(col, index, cols, showWeekendTint)
        const view = viewMap.get(`${col.year}-${col.month}`)
        const scheduleRow = view?.schedule?.[name]
        if (!view || !scheduleRow) return `<td class="${cls}"></td>`

        const shift = scheduleRow[col.day - 1] ?? ''
        const leaveCode = view.leave_details?.[name]?.[String(col.day)] ?? null
        const leaveName = leaveCode ? leaveNameByCode.get(leaveCode) : undefined
        const sequence =
          leaveCode === 'SPECIAL'
            ? view.leave_sequence?.[name]?.[String(col.day)]
            : undefined

        let text = ''
        let extraClass = ''
        let offOrder: number | null = null

        if (shift === 'OFF') {
          const iso = isoDate(col.year, col.month, col.day)
          offOrder = offIndex?.get(iso) ?? 0
          extraClass = offOrder === 0 ? ' off-first' : ' off-second'
        } else if (isManager && (shift === 'M' || shift === 'EMPTY' || !shift)) {
          // 主管班＝M（09:00-17:00）；依選項留白或顯示 M。
          text = managerBlank ? '' : 'M'
        } else {
          text = cellText(shift, leaveCode, leaveName, sequence)
        }

        const offMark = offOrder === null ? '' : renderOffMark(offOrder)
        return `<td class="shift-cell ${cls}${extraClass}${offOrder === null ? '' : ' off-cell'}">${offMark}${esc(text)}</td>`
      })

      const groupCell =
        rowIndex === 0
          ? `<td class="grp" rowspan="${rows.length}">${esc(groupLabel)}</td>`
          : ''
      return `<tr>${groupCell}<td class="tag">${esc(roleTag(employee))}</td><td class="name">${esc(printName(employee, name))}</td>${cells.join('')}</tr>`
    })
    .join('')
}

function renderOffMark(order: number): string {
  // 用 inline SVG 畫線，避免 CSS gradient 在「另存 PDF」時被 rasterize 成黑塊。
  const lines = ['<line x1="0" y1="100" x2="100" y2="0" />']
  if (order !== 0) lines.push('<line x1="0" y1="0" x2="100" y2="100" />')
  return `<svg class="off-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`
}

function renderOccupancyRow(cols: PrintColumn[], showWeekendTint: boolean): string {
  const cells = cols.map(
    (col, index) => `<td class="${dayClass(col, index, cols, showWeekendTint)}"></td>`,
  )
  return `<tr class="occupancy"><td class="grp"></td><td class="tag"></td><td class="name">新訂加續住</td>${cells.join('')}</tr>`
}

function rangeLabel(cols: PrintColumn[]): string {
  if (cols.length === 0) return ''
  const first = cols[0]
  const last = cols[cols.length - 1]
  return `${first.month}/${first.day} ~ ${last.month}/${last.day}`
}

function collectUsedLeaveCodes(views: MonthScheduleView[]): Set<string> {
  const used = new Set<string>()
  for (const view of views) {
    for (const details of Object.values(view.leave_details ?? {})) {
      for (const code of Object.values(details)) used.add(code)
    }
  }
  return used
}

function renderFooter(
  opts: PrintScheduleOptions,
  views: MonthScheduleView[],
): string {
  const {
    includeHousekeeping,
    managerBlank = true,
    notesText = '',
    userName = '',
    leaveTypes,
  } = opts

  const shiftItems = ['A', 'B', 'C', 'D', 'M'].map(
    (s) =>
      `<span class="lg"><span class="sw sw-shift">${s}</span>${SHIFT_TIMES[s]}</span>`,
  )
  if (includeHousekeeping) {
    shiftItems.push(
      `<span class="lg"><span class="sw sw-shift">房務 A</span>09:00-18:00（含用餐 1 小時）</span>`,
    )
  }

  const offItems = [
    `<span class="lg"><span class="sw sw-off">/</span>每週第一休</span>`,
    `<span class="lg"><span class="sw sw-off">X</span>每週第二休</span>`,
  ]
  if (managerBlank) {
    offItems.push(`<span class="lg">空白＝<b>M 主管班 09:00-17:00</b></span>`)
  }

  const usedLeaveCodes = collectUsedLeaveCodes(views)
  const leaveItems = leaveTypes
    .filter((lt) => usedLeaveCodes.has(lt.code))
    .map((lt) => {
      const short = shortLeaveLabel(lt.code, lt.name)
      const bg = safeColor(lt.color_bg, '#e1bee7')
      const text = safeColor(lt.color_text, '#4a148c')
      return `<span class="lg"><span class="sw" style="background:${bg};color:${text}">${esc(short)}</span>${esc(lt.name)}</span>`
    })

  const noteLines = notesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<div>${esc(line)}</div>`)
    .join('')

  const printedAt = new Date()
  const printedLabel = `${printedAt.getFullYear()}/${String(printedAt.getMonth() + 1).padStart(2, '0')}/${String(printedAt.getDate()).padStart(2, '0')}`

  return `<div class="footer">
  <div class="legend"><b>上班時段</b>${shiftItems.join('')}</div>
  <div class="legend"><b>休假</b>${offItems.join('')}${
    leaveItems.length ? `<b class="legend-gap">假別</b>${leaveItems.join('')}` : ''
  }</div>
  ${noteLines ? `<div class="notes">${noteLines}</div>` : ''}
  <div class="signatures">
    <span>製表人：${esc(userName)}</span>
    <span>單位主管：____________</span>
    <span>會計：____________</span>
  </div>
  <div class="printed">列印日期：${printedLabel}</div>
</div>`
}

export function buildPrintHtml(opts: PrintScheduleOptions): string {
  const {
    frontView,
    housekeepingView = null,
    frontNeighborViews = [],
    housekeepingNeighborViews = [],
    previousMonthOffDates = {},
    employees,
    leaveTypes,
    hotelName,
    branchName = '',
    wholeWeek,
    includeHousekeeping,
    managerBlank = true,
    holidayNotes = {},
    showWeekendTint = false,
    includeOccupancyRow = true,
    includeStats = false,
  } = opts

  const { year, month } = frontView
  const cols = buildPrintColumns(frontView, wholeWeek)
  const frontViews = [frontView, ...frontNeighborViews]
  const hkViews = housekeepingView
    ? [housekeepingView, ...housekeepingNeighborViews]
    : []
  const frontMap = buildViewMap(frontViews)
  const hkMap = buildViewMap(hkViews)

  const frontRows = buildRows(frontView, employees)
  const hkRows = housekeepingView ? buildRows(housekeepingView, employees) : []

  const frontOff = buildOffIndexByEmployee(
    frontViews,
    frontRows.map((r) => r.name),
    previousMonthOffDates,
  )
  const hkOff = buildOffIndexByEmployee(
    hkViews,
    hkRows.map((r) => r.name),
  )

  const leaveNameByCode = new Map(leaveTypes.map((lt) => [lt.code, lt.name]))
  const managerNames = new Set(
    employees.filter((e) => e.role === 'manager').map((e) => e.name),
  )

  const header = renderHeaderRows(cols, holidayNotes, showWeekendTint)
  const frontBody = renderGroupRows(
    '櫃台',
    frontRows,
    cols,
    frontMap,
    frontOff,
    leaveNameByCode,
    managerNames,
    managerBlank,
    showWeekendTint,
  )
  const hkBody = includeHousekeeping
    ? renderGroupRows(
        '房務',
        hkRows,
        cols,
        hkMap,
        hkOff,
        leaveNameByCode,
        managerNames,
        managerBlank,
        showWeekendTint,
      )
    : ''
  const occupancy =
    includeOccupancyRow && (frontRows.length > 0 || hkRows.length > 0)
      ? renderOccupancyRow(cols, showWeekendTint)
      : ''

  const hasManagerRow = [...frontRows, ...hkRows].some((r) => managerNames.has(r.name))
  const hasAnyRow =
    frontRows.length > 0 || (includeHousekeeping && hkRows.length > 0)
  const table = hasAnyRow
    ? `<table>
  <colgroup>
    <col class="c-grp" />
    <col class="c-tag" />
    <col class="c-name" />
    ${cols.map(() => '<col class="c-day" />').join('')}
  </colgroup>
  ${header.html}
  <tbody>${frontBody}${hkBody}${occupancy}</tbody>
</table>`
    : `<div class="empty">（本月尚無班表）</div>`

  const rocYear = year - 1911
  const monthLabel =
    rocYear > 0 ? `${rocYear}（${year}）年 ${month} 月` : `${year} 年 ${month} 月`
  const title = `${hotelName} ${year} 年 ${month} 月班表`
  const branchLine = branchName.trim()
    ? `<div class="branch">${esc(branchName.trim())}</div>`
    : ''
  const rangeNote = wholeWeek
    ? `<div class="range-note">整週檢視：${rangeLabel(cols)}</div>`
    : ''
  const hkEmptyNote =
    includeHousekeeping && hkRows.length === 0
      ? '<div class="empty">（本月尚無房務班表）</div>'
      : ''
  const statsTable =
    includeStats && (frontRows.length > 0 || hkRows.length > 0)
      ? renderStatsTable(
          buildPrintStats(frontView, housekeepingView, employees, leaveTypes),
        )
      : ''

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif;
    color: #111;
    font-size: 9px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media screen { body { padding: 8mm; background: #fff; } }
  .doc-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 12px;
    border-bottom: 2px solid #222;
    padding-bottom: 3px;
    margin-bottom: 4px;
  }
  .doc-title { text-align: center; }
  .hotel { font-size: 16px; font-weight: 700; letter-spacing: 2px; line-height: 1.15; }
  .branch { font-size: 10px; color: #333; margin-top: 1px; }
  .month { justify-self: end; font-size: 14px; font-weight: 700; white-space: nowrap; }
  .range-note { font-size: 8px; color: #666; text-align: right; margin: 1px 0 3px; }
  .empty { font-size: 10px; color: #666; margin: 6px 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
    border: 1px solid #333;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td {
    border: 1px solid #999;
    text-align: center;
    vertical-align: middle;
    padding: 0;
    height: 20px;
    font-size: 9px;
    line-height: 1.1;
    overflow: hidden;
  }
  .head { background: #f2f2f2; font-weight: 700; }
  .name-head { font-size: 9px; }
  .holiday-row th { height: 14px; font-size: 7.5px; background: #fff; font-weight: 600; }
  .date-row th { font-weight: 700; }
  .weekday-row th { font-size: 8px; color: #555; }
  .day { font-weight: 700; }
  .wk { font-size: 8px; }
  .grp { width: 18px; font-weight: 700; background: #fafafa; }
  .tag { width: 28px; font-size: 7.5px; color: #444; }
  .name {
    width: 76px;
    text-align: left;
    padding-left: 2px;
    font-size: 8.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-grp { width: 18px; }
  .c-tag { width: 28px; }
  .c-name { width: 76px; }
  td.shift-cell { font-size: 12px; font-weight: 700; }
  .week-start { border-left: 1.5px solid #7030A0; }
  .week-end { border-right: 1.5px solid #7030A0; }
  .weekend { background: #f7f7f7; }
  .other-month { color: #aaa; background: #fbfbfb; }
  .occupancy td { height: 20px; }
  .off-cell { position: relative; }
  .off-mark {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .off-mark line {
    stroke: #222;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
  }
  .stats-block { margin-top: 8px; page-break-inside: auto; }
  .stats-title { margin: 6px 0 4px; font-size: 13px; font-weight: 700; }
  .stats-table {
    width: 100%;
    table-layout: auto;
    border-collapse: collapse;
  }
  .stats-table thead { display: table-header-group; }
  .stats-table tr { page-break-inside: avoid; }
  .stats-table th, .stats-table td {
    height: 22px;
    padding: 2px 7px;
    border: 1px solid #999;
    font-size: 12px;
    text-align: center;
  }
  .stats-table th { background: #f2f2f2; font-weight: 700; }
  .stats-table .st-group { width: 46px; white-space: nowrap; }
  .stats-table .st-name { text-align: left; white-space: nowrap; font-weight: 600; }
  .footer {
    margin-top: 4px;
    font-size: 8px;
    color: #222;
    page-break-inside: avoid;
  }
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; margin-top: 2px; }
  .legend-gap { margin-left: 6px; }
  .lg { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
  .sw {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 12px;
    border: 1px solid #999;
    border-radius: 2px;
    font-size: 7px;
    font-weight: 700;
    line-height: 1;
  }
  .sw-shift { background: #fff; }
  .sw-off { background: #fff; font-size: 10px; }
  .notes { margin-top: 3px; line-height: 1.35; }
  .signatures {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 10px;
    font-size: 9px;
  }
  .printed { text-align: right; color: #777; font-size: 7px; margin-top: 2px; }
</style>
</head>
<body>
  <div class="doc-head">
    <div aria-hidden="true"></div>
    <div class="doc-title">
      <div class="hotel">${esc(hotelName)}</div>
      ${branchLine}
    </div>
    <div class="month">${monthLabel}</div>
  </div>
  ${rangeNote}
  ${table}
  ${hkEmptyNote}
  ${statsTable}
  ${renderFooter(
    { ...opts, managerBlank: managerBlank && hasManagerRow },
    [...frontViews, ...hkViews],
  )}
</body>
</html>`

  return html
}
