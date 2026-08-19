import { useState } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
import { Trash2, Pencil, Plus } from 'lucide-react'
import type { LeaveType } from '../../types'

const PRESET_COLORS = [
  '#e1bee7', '#ce93d8', '#f48fb1', '#ef9a9a', '#ffcc80', '#ffe0b2',
  '#fff59d', '#c5e1a5', '#a5d6a7', '#80cbc4', '#81d4fa', '#90caf9',
  '#9fa8da', '#b0bec5', '#cfd8dc', '#ffab91',
]

const TEXT_COLORS = ['#4a148c', '#6a1b9a', '#880e4f', '#b71c1c', '#e65100', '#1b5e20', '#004d40', '#0d47a1', '#1a237e', '#37474f']

interface LeaveTypeManagerProps {
  open: boolean
  leaveTypes: LeaveType[]
  onClose: () => void
  onCreate: (name: string, color_bg: string, color_text: string) => Promise<void>
  onUpdate: (code: string, payload: { name?: string; color_bg?: string; color_text?: string }) => Promise<void>
  onDelete: (code: string) => Promise<void>
}

export function LeaveTypeManager({
  open, leaveTypes, onClose, onCreate, onUpdate, onDelete,
}: LeaveTypeManagerProps) {
  const [name, setName] = useState('')
  const [bg, setBg] = useState('#ffe0b2')
  const [text, setText] = useState('#e65100')
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [editName, setEditName] = useState('')
  const [editBg, setEditBg] = useState('')
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      await onCreate(name, bg, text)
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(lt: LeaveType) {
    setEditing(lt)
    setEditName(lt.name)
    setEditBg(lt.color_bg)
    setEditText(lt.color_text)
  }

  async function handleUpdate() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      await onUpdate(editing.code, { name: editName, color_bg: editBg, color_text: editText })
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失敗')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(code: string) {
    setBusy(true)
    setError(null)
    try {
      await onDelete(code)
    } catch (e) {
      setError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="假別管理" onClose={onClose} className="max-w-xl">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-orange-50 px-4 py-2 text-sm text-orange-700">{error}</div>
        )}

        <div className="rounded-md border border-gray-200 p-3">
          <div className="mb-2 text-sm font-medium text-gray-700">新增自訂假別</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名稱（如：喪假）"
              className="w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
            <ColorInput label="底色" value={bg} onChange={setBg} palette={PRESET_COLORS} />
            <ColorInput label="字色" value={text} onChange={setText} palette={TEXT_COLORS} />
            <Button onClick={handleCreate} disabled={busy || !name.trim()}>
              <Plus className="mr-1 h-4 w-4" /> 新增
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {leaveTypes.map((lt) => (
            <div key={lt.code} className="rounded-md border border-gray-200 p-2">
              {editing?.code === lt.code ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  <ColorInput label="底色" value={editBg} onChange={setEditBg} palette={PRESET_COLORS} />
                  <ColorInput label="字色" value={editText} onChange={setEditText} palette={TEXT_COLORS} />
                  <Button variant="outline" onClick={handleUpdate} disabled={busy}>儲存</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold"
                    style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
                  >
                    {lt.name.length > 2 ? lt.name.slice(0, 2) : lt.name}
                  </span>
                  <span className="flex-1 text-sm text-gray-700">
                    {lt.name}
                    {lt.is_builtin ? <span className="ml-2 text-xs text-gray-400">內建</span> : null}
                  </span>
                  {!lt.is_builtin && (
                    <>
                      <button
                        onClick={() => startEdit(lt)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(lt.code)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </div>
      </div>
    </Modal>
  )
}

function ColorInput({
  label, value, onChange, palette,
}: { label: string; value: string; onChange: (v: string) => void; palette: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-9 cursor-pointer rounded border border-gray-300"
      />
      <select
        value={palette.includes(value) ? value : ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-gray-300"
        title="快速選色"
      >
        <option value="">…</option>
        {palette.map((c) => (
          <option key={c} value={c} style={{ backgroundColor: c }} />
        ))}
      </select>
    </div>
  )
}
