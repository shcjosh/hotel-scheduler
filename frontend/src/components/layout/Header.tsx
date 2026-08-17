import { useUIStore } from '../../stores/uiStore'

const YEARS = [2025, 2026, 2027]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function Header({ title }: { title: string }) {
  const { currentYear, currentMonth, setCurrentYear, setCurrentMonth } =
    useUIStore()

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            J
          </div>
          Josh Wang
        </div>
      </div>
    </header>
  )
}
