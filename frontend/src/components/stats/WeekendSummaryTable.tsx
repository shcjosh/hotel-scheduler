import type { MonthStats } from '../../api/stats'
import { getWeekdayLabel } from '../../utils/date'

export function WeekendSummaryTable({ weekend }: { weekend: MonthStats['weekend_summary'] }) {
  const renderDay = (entry: { day: number; workers: string[]; shifts: string[] }, weekday: number) => (
    <tr key={entry.day} className="border-t border-gray-100">
      <td className="px-3 py-1.5 font-medium text-gray-800">{entry.day}</td>
      <td className="px-3 py-1.5 text-red-500">{getWeekdayLabel(weekday)}</td>
      <td className="px-3 py-1.5 text-gray-700">{entry.workers.join('、') || '—'}</td>
      <td className="px-3 py-1.5 text-gray-600">{entry.shifts.join('、') || '—'}</td>
    </tr>
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">週六</div>
        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr><th className="px-3 py-1 text-left">日期</th><th className="px-3 py-1 text-left">星期</th><th className="px-3 py-1 text-left">上班人員</th><th className="px-3 py-1 text-left">班次</th></tr>
          </thead>
          <tbody>{weekend.saturdays.map((e) => renderDay(e, 6))}</tbody>
        </table>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">週日</div>
        <table className="w-full text-sm">
          <thead className="text-gray-500">
            <tr><th className="px-3 py-1 text-left">日期</th><th className="px-3 py-1 text-left">星期</th><th className="px-3 py-1 text-left">上班人員</th><th className="px-3 py-1 text-left">班次</th></tr>
          </thead>
          <tbody>{weekend.sundays.map((e) => renderDay(e, 0))}</tbody>
        </table>
      </div>
    </div>
  )
}
