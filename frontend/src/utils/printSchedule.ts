import type { Employee, LeaveType, MonthScheduleView } from '../types'
import { getWeekday, getWeekdayLabel } from './date'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cellText(shift: string, source: string, leaveName?: string): string {
  if (shift === 'OFF') return source === 'designated' ? '指定' : '休'
  if (shift === 'SPECIAL') {
    if (!leaveName) return '假'
    return leaveName.length > 2 ? leaveName.slice(0, 2) : leaveName
  }
  return shift
}

export function printSchedule(
  view: MonthScheduleView,
  employees: Employee[],
  leaveTypes: LeaveType[],
  hotelName: string,
): void {
  const { schedule, sources, leave_details: leaveDetails, num_days: numDays, year, month } = view
  const nickByName = new Map(employees.map((e) => [e.name, e.nickname || e.name]))
  const leaveNameByCode = new Map(leaveTypes.map((lt) => [lt.code, lt.name]))

  const dayHeaders: string[] = []
  for (let d = 1; d <= numDays; d++) {
    const wd = getWeekday(year, month, d)
    const weekend = wd === 0 || wd === 6
    const weekStart = d === 1 || wd === 1
    const weekEnd = d === numDays || wd === 0
    const cls = [weekend && 'weekend', weekStart && 'week-start', weekEnd && 'week-end'].filter(Boolean).join(' ')
    const wk = getWeekdayLabel(wd)
    dayHeaders.push(
      `<th class="${cls}"><div class="day">${d}</div><div class="wk">${wk}</div></th>`,
    )
  }

  const rows: string[] = []
  for (const [name, row] of Object.entries(schedule)) {
    const label = nickByName.get(name) ?? name
    const cells: string[] = [`<td class="name">${esc(label)}</td>`]
    for (let d = 0; d < numDays; d++) {
      const day = d + 1
      const wd = getWeekday(year, month, day)
      const weekend = wd === 0 || wd === 6
      const weekStart = day === 1 || wd === 1
      const weekEnd = day === numDays || wd === 0
      const cls = [weekend && 'weekend', weekStart && 'week-start', weekEnd && 'week-end'].filter(Boolean).join(' ')
      const shift = row[d] ?? ''
      const source = sources?.[name]?.[d] ?? ''
      const leaveCode = leaveDetails?.[name]?.[String(day)]
      const text = cellText(shift, source, leaveCode ? leaveNameByCode.get(leaveCode) : undefined)
      cells.push(`<td class="${cls}">${esc(text)}</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }

  const title = `${hotelName} ${year} 年 ${month} 月班表`
  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 8px; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #9ca3af; text-align: center; font-size: 9px; padding: 2px 0; }
  .name { font-weight: 600; width: 44px; }
  .day { font-weight: 600; }
  .wk { color: #9ca3af; font-size: 8px; }
  .weekend { background: #e5e7eb; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .week-start { border-left: 2px solid #111827; }
  .week-end { border-right: 2px solid #111827; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<table>
<thead><tr><th class="name">員工</th>${dayHeaders.join('')}</tr></thead>
<tbody>${rows.join('')}</tbody>
</table>
<script>window.onload = function () { window.print(); }</script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
}
