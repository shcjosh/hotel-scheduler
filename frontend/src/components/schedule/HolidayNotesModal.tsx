import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { getWeekday, getWeekdayLabel } from '../../utils/date'

interface HolidayNotesModalProps {
  open: boolean
  year: number
  month: number
  numDays: number
  value: Record<number, string>
  onClose: () => void
  onSave: (notes: Record<number, string>) => Promise<void>
}

export function HolidayNotesModal({
  open,
  year,
  month,
  numDays,
  value,
  onClose,
  onSave,
}: HolidayNotesModalProps) {
  const [notes, setNotes] = useState<Record<number, string>>(value)
  const [newDay, setNewDay] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNotes(value)
    setNewDay('')
    setNewLabel('')
    setError(null)
    setSaving(false)
  }, [open, value])

  const sortedDays = useMemo(
    () =>
      Object.keys(notes)
        .map(Number)
        .filter((d) => Number.isFinite(d) && d >= 1 && d <= numDays)
        .sort((a, b) => a - b),
    [notes, numDays],
  )

  function addNote() {
    const day = Number(newDay)
    const label = newLabel.trim()
    if (!day || day < 1 || day > numDays) {
      setError('請選擇日期')
      return
    }
    if (!label) {
      setError('請輸入節日或備註文字')
      return
    }
    setNotes((prev) => ({ ...prev, [day]: label }))
    setNewDay('')
    setNewLabel('')
    setError(null)
  }

  function removeNote(day: number) {
    setNotes((prev) => {
      const next = { ...prev }
      delete next[day]
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cleaned: Record<number, string> = {}
      for (const [day, label] of Object.entries(notes)) {
        const d = Number(day)
        if (d >= 1 && d <= numDays && label.trim()) cleaned[d] = label.trim()
      }
      await onSave(cleaned)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={`節日／備註 — ${year} 年 ${month} 月`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          設定後會顯示在 PDF 日期列上方；連續相同文字會自動合併成一格（例如尾牙、除夕、初一）。
        </p>

        {sortedDays.length > 0 ? (
          <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">日期</th>
                  <th className="px-3 py-2 text-left font-medium">文字</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedDays.map((day) => (
                  <tr key={day} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">
                      {month}/{day}（{getWeekdayLabel(getWeekday(year, month, day))}）
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={notes[day] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [day]: e.target.value }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeNote(day)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="刪除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            尚未設定節日或備註
          </div>
        )}

        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold text-gray-700">新增／修改</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">選擇日期</option>
              {Array.from({ length: numDays }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {month}/{day}（{getWeekdayLabel(getWeekday(year, month, day))}）
                </option>
              ))}
            </select>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNote()
              }}
              placeholder="例如：元旦、尾牙、主會"
              className="min-w-40 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
            <Button type="button" variant="outline" onClick={addNote}>
              <Plus className="mr-1 h-4 w-4" /> 新增
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            同一天重複新增會覆蓋原文字；要刪除請用列表右側的垃圾桶。
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
