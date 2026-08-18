import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '../../stores/uiStore'
import { getSettings, updateSetting } from '../../api/settings'

const YEARS = [2025, 2026, 2027]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function Header({ title }: { title: string }) {
  const { currentYear, currentMonth, setCurrentYear, setCurrentMonth } = useUIStore()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const hotelName = data?.hotel_name ?? '清翼居府中館'
  const userName = data?.user_name ?? 'Josh Wang'

  useEffect(() => {
    document.title = `${title} — 飯店排班`
  }, [title])
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  const saveMut = useMutation({
    mutationFn: (value: string) => updateSetting('hotel_name', value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })
  const saveNameMut = useMutation({
    mutationFn: (value: string) => updateSetting('user_name', value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  function startEdit() {
    setDraft(hotelName)
    setEditing(true)
  }
  function commit() {
    const v = draft.trim()
    setEditing(false)
    if (v && v !== hotelName) saveMut.mutate(v)
  }
  function cancel() {
    setEditing(false)
  }

  function startEditName() {
    setNameDraft(userName)
    setEditingName(true)
  }
  function commitName() {
    const v = nameDraft.trim()
    setEditingName(false)
    if (v && v !== userName) saveNameMut.mutate(v)
  }
  function cancelName() {
    setEditingName(false)
  }

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="flex items-center gap-1 text-lg font-semibold text-gray-800">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') cancel()
            }}
            className="rounded border border-indigo-300 px-2 py-0.5 text-lg font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-300"
          />
        ) : (
          <button
            onClick={startEdit}
            className="rounded px-1 hover:bg-gray-100"
            title="點擊編輯飯店名稱"
          >
            {hotelName}
          </button>
        )}
        <span className="text-gray-500">飯店排班系統</span>
      </h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            {userName.charAt(0) || '?'}
          </div>
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') cancelName()
              }}
              className="w-28 rounded border border-indigo-300 px-2 py-0.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-indigo-300"
            />
          ) : (
            <button
              onClick={startEditName}
              className="rounded px-1 hover:bg-gray-100"
              title="點擊編輯使用者名稱"
            >
              {userName}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
