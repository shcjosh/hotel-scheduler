import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  getAnnualLeave,
  upsertAdjustment,
  addManualEntry,
  deleteManualEntry,
  type AnnualLeavePeriod,
} from '../../api/annualLeave'
import { useUIStore } from '../../stores/uiStore'
import type { Employee } from '../../types'

const pad = (n: number) => String(n).padStart(2, '0')

function yearsLabel(years: number): string {
  if (years <= 0) return '滿 6 個月'
  return `滿 ${years} 年`
}

export function AnnualLeavePanel({ employee }: { employee: Employee | null }) {
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['annual-leave', year, month],
    queryFn: () => getAnnualLeave(year, month),
  })
  const [error, setError] = useState<string | null>(null)

  if (!employee) return null

  const info = data?.employees?.[String(employee.id)]

  async function invalidate() {
    setError(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['annual-leave', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['off-days', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['schedule', year, month] }),
      queryClient.invalidateQueries({ queryKey: ['off-day-summary', year, month] }),
    ])
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-purple-900">
          特休紀錄（週年制）
        </h3>
        {employee.hire_date ? (
          <span className="text-xs text-purple-700">
            到職日 {employee.hire_date}
            {info?.seniority_years != null && `（年資約 ${info.seniority_years} 年）`}
          </span>
        ) : (
          <span className="text-xs text-orange-600">
            尚未設定到職日 — 請至員工管理設定
          </span>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>
      )}

      {employee.hire_date && (!info || info.periods.length === 0) && (
        <div className="text-xs text-gray-500">本月無特休期間（可能到職未滿 6 個月）。</div>
      )}

      <div className="space-y-2">
        {info?.periods.map((p) => (
          <PeriodCard
            key={`${p.period_start}:${p.opening_used_days}:${p.entitlement_override}`}
            employeeId={employee.id}
            period={p}
            onSave={async (opening, override, note) => {
              try {
                await upsertAdjustment({
                  employee_id: employee.id,
                  period_start: p.period_start,
                  opening_used_days: opening,
                  entitlement_override: override,
                  note,
                })
                await invalidate()
              } catch (e) {
                setError(e instanceof Error ? e.message : '儲存失敗')
              }
            }}
          />
        ))}
      </div>

      {employee.hire_date && info && info.periods.length > 0 && (
        <ManualEntries
          entries={info.manual_entries}
          defaultDate={`${year}-${pad(month)}-01`}
          onAdd={async (date, days, note) => {
            try {
              await addManualEntry(employee.id, date, days, note)
              await invalidate()
            } catch (e) {
              setError(e instanceof Error ? e.message : '新增失敗')
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteManualEntry(id)
              await invalidate()
            } catch (e) {
              setError(e instanceof Error ? e.message : '刪除失敗')
            }
          }}
        />
      )}
    </div>
  )
}

function PeriodCard({
  period,
  onSave,
}: {
  employeeId: number
  period: AnnualLeavePeriod
  onSave: (opening: number, override: number | null, note: string | null) => Promise<void>
}) {
  const [opening, setOpening] = useState(String(period.opening_used_days))
  const [override, setOverride] = useState(
    period.entitlement_override != null ? String(period.entitlement_override) : '',
  )
  const [saving, setSaving] = useState(false)

  const over = period.remaining < 0

  async function handleSave() {
    setSaving(true)
    try {
      const o = Number(opening)
      await onSave(
        Number.isFinite(o) ? o : 0,
        override.trim() === '' ? null : Number(override),
        period.note,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-purple-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-gray-800">
          {period.period_start} ~ {period.period_end}
          <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
            {yearsLabel(period.years)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-600">
            額度 <b>{period.entitlement}</b> 天
            {period.entitlement_override != null && (
              <span className="ml-1 text-purple-600">(覆寫，法定 {period.entitlement_law})</span>
            )}
          </span>
          <span className="text-gray-600">已用 <b>{period.used_days}</b></span>
          <span className={over ? 'font-semibold text-red-600' : 'text-green-700'}>
            剩餘 <b>{period.remaining}</b> 天{over && '（已超用）'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs text-gray-600">
          期初已用（系統外）
          <input
            type="number"
            step={0.5}
            min={0}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600">
          覆寫額度（留空 = 法定）
          <input
            type="number"
            step={0.5}
            min={0}
            placeholder={String(period.entitlement_law)}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
        <span className="text-xs text-gray-400">
          系統內特休 {period.system_days} 天 / 半天紀錄 {period.manual_days} 天
        </span>
      </div>
    </div>
  )
}

function ManualEntries({
  entries,
  defaultDate,
  onAdd,
  onDelete,
}: {
  entries: { id: number; date: string; days: number; note: string | null }[]
  defaultDate: string
  onAdd: (date: string, days: number, note: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [date, setDate] = useState(defaultDate)
  const [days, setDays] = useState('0.5')
  const [note, setNote] = useState('')

  return (
    <div className="mt-3 border-t border-purple-200 pt-3">
      <div className="text-xs font-semibold text-purple-900">半天 / 臨時補登（不涉排班）</div>
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          type="number"
          step={0.5}
          min={0.5}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註（選填）"
          className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={async () => {
            const d = Number(days)
            if (!date || !Number.isFinite(d) || d <= 0) return
            await onAdd(date, d, note.trim())
            setNote('')
          }}
          className="rounded-md border border-purple-400 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
        >
          新增
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-700">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="tabular-nums">{e.date}</span>
              <span className="font-medium">{e.days} 天</span>
              {e.note && <span className="text-gray-400">{e.note}</span>}
              <button
                type="button"
                onClick={() => onDelete(e.id)}
                className="text-red-400 hover:text-red-600"
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
