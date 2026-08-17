import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getEmployees } from '../api/employees'
import {
  getOffDays,
  getOffDaySummary,
  addDesignatedOff,
  removeDesignatedOff,
  addSpecialLeave,
  removeSpecialLeave,
} from '../api/offDays'
import { useUIStore } from '../stores/uiStore'
import { getMonthDays } from '../utils/date'
import { ROLE_LABELS } from '../utils/roles'
import { OffDayCalendar } from '../components/off-days/OffDayCalendar'
import { ConsecutiveOffCounter } from '../components/off-days/ConsecutiveOffCounter'
import { cn } from '../utils/cn'

type Mode = 'designated' | 'special'

export function OffDaysPage() {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('designated')
  const [error, setError] = useState<string | null>(null)

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })
  const { data: offDays } = useQuery({
    queryKey: ['off-days', year, month],
    queryFn: () => getOffDays(year, month),
  })
  const { data: summary } = useQuery({
    queryKey: ['off-day-summary', year, month],
    queryFn: () => getOffDaySummary(year, month),
  })

  const empId = selectedId ?? employees[0]?.id ?? null
  const empKey = empId !== null ? String(empId) : null
  const numDays = getMonthDays(year, month)

  const designatedSet = useMemo(
    () => new Set((empKey && offDays?.designated_off_days[empKey]) || []),
    [empKey, offDays],
  )
  const specialSet = useMemo(
    () => new Set((empKey && offDays?.special_leaves[empKey]) || []),
    [empKey, offDays],
  )
  const runDays = useMemo(
    () => new Set((empKey && summary?.[empKey]?.consecutive_off_days) || []),
    [empKey, summary],
  )
  const empSummary = empKey ? summary?.[empKey] : undefined

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['off-days', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['off-day-summary', year, month] }),
    ])
  }

  async function toggleDay(day: number) {
    if (empId === null) return
    setError(null)
    const desig = designatedSet.has(day)
    const spec = specialSet.has(day)
    try {
      if (mode === 'designated') {
        if (desig) {
          await removeDesignatedOff(empId, year, month, day)
        } else if (spec) {
          setError('該日已為特休')
          return
        } else {
          await addDesignatedOff(empId, year, month, day)
        }
      } else {
        if (spec) {
          await removeSpecialLeave(empId, year, month, day)
        } else if (desig) {
          setError('該日已為指定休假')
          return
        } else {
          await addSpecialLeave(empId, year, month, day)
        }
      }
      await invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">休假管理</h2>
          <p className="text-sm text-gray-500">
            {year} 年 {month} 月 — 指定休假與特休
          </p>
        </div>
        {empSummary && (
          <ConsecutiveOffCounter count={empSummary.consecutive_off_count} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={empId ?? ''}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{ROLE_LABELS[e.role]}）
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-gray-300">
          {(['designated', 'special'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={cn(
                'px-4 py-1.5 text-sm font-medium transition',
                mode === m
                  ? m === 'designated'
                    ? 'bg-red-500 text-white'
                    : 'bg-purple-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {m === 'designated' ? '指定休假' : '特休'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-orange-50 px-4 py-2 text-sm text-orange-700">
          {error}
        </div>
      )}

      {empId !== null ? (
        <OffDayCalendar
          year={year}
          month={month}
          numDays={numDays}
          designatedDays={designatedSet}
          specialDays={specialSet}
          runDays={runDays}
          onToggleDay={toggleDay}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
          尚無員工
        </div>
      )}

      {summary && employees.length > 0 && (
        <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">員工</th>
                <th className="px-4 py-2 text-left">角色</th>
                <th className="px-4 py-2 text-right">指定休假</th>
                <th className="px-4 py-2 text-right">特休</th>
                <th className="px-4 py-2 text-right">連休 2 日</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const s = summary[String(e.id)]
                return (
                  <tr
                    key={e.id}
                    className="border-t border-gray-100 hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">{e.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {ROLE_LABELS[e.role]}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s?.designated_count ?? 0} / 2
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s?.special_count ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s?.consecutive_off_count ?? 0} / 2
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
