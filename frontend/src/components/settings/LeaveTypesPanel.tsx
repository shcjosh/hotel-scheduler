import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Section } from '../ui/section'
import { Badge } from '../ui/badge'
import type { LeaveType } from '../../types'

const PRESET_COLORS = [
  '#e1bee7', '#ce93d8', '#f48fb1', '#ef9a9a', '#ffcc80', '#ffe0b2',
  '#fff59d', '#c5e1a5', '#a5d6a7', '#80cbc4', '#81d4fa', '#90caf9',
  '#9fa8da', '#b0bec5', '#cfd8dc', '#ffab91',
]

const TEXT_COLORS = [
  '#4a148c', '#6a1b9a', '#880e4f', '#b71c1c', '#e65100',
  '#1b5e20', '#004d40', '#0d47a1', '#1a237e', '#37474f',
]

interface LeaveTypesPanelProps {
  leaveTypes: LeaveType[]
  onCreate: (name: string, color_bg: string, color_text: string) => Promise<void>
  onUpdate: (code: string, payload: { name?: string; color_bg?: string; color_text?: string }) => Promise<void>
  onDelete: (code: string) => Promise<void>
}

/** 假別管理（/settings?tab=leave-types）。 */
export function LeaveTypesPanel({ leaveTypes, onCreate, onUpdate, onDelete }: LeaveTypesPanelProps) {
  const [name, setName] = useState('')
  const [bg, setBg] = useState('#ffe0b2')
  const [text, setText] = useState('#e65100')
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [editName, setEditName] = useState('')
  const [editBg, setEditBg] = useState('')
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, fallbackMessage: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <Section
        title="新增自訂假別"
        description="自訂假別可用在休假管理與班表畫筆；已排入班表的假別刪除前會提示。"
        contentPadded
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="名稱（如：喪假）"
            className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <ColorInput label="底色" value={bg} onChange={setBg} palette={PRESET_COLORS} />
          <ColorInput label="字色" value={text} onChange={setText} palette={TEXT_COLORS} />
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              run(async () => {
                await onCreate(name, bg, text)
                setName('')
              }, '新增失敗')
            }
          >
            <Plus className="mr-1 h-4 w-4" /> 新增
          </Button>
        </div>
      </Section>

      <Section title="假別清單" description={`共 ${leaveTypes.length} 種（內建假別不可刪除）`}>
        <ul className="divide-y divide-slate-100">
          {leaveTypes.map((leaveType) => (
            <li key={leaveType.code} className="px-4 py-2">
              {editing?.code === leaveType.code ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <ColorInput
                    label="底色"
                    value={editBg}
                    onChange={setEditBg}
                    palette={PRESET_COLORS}
                  />
                  <ColorInput
                    label="字色"
                    value={editText}
                    onChange={setEditText}
                    palette={TEXT_COLORS}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await onUpdate(leaveType.code, {
                          name: editName,
                          color_bg: editBg,
                          color_text: editText,
                        })
                        setEditing(null)
                      }, '修改失敗')
                    }
                  >
                    儲存
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                    取消
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold"
                    style={{ backgroundColor: leaveType.color_bg, color: leaveType.color_text }}
                  >
                    {leaveType.name.length > 2 ? leaveType.name.slice(0, 2) : leaveType.name}
                  </span>
                  <span className="flex-1 text-sm text-slate-700">{leaveType.name}</span>
                  {leaveType.is_builtin ? (
                    <Badge>內建</Badge>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditing(leaveType)
                          setEditName(leaveType.name)
                          setEditBg(leaveType.color_bg)
                          setEditText(leaveType.color_text)
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="編輯"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          run(() => onDelete(leaveType.code), '刪除失敗')
                        }
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="刪除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function ColorInput({
  label,
  value,
  onChange,
  palette,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  palette: string[]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-9 cursor-pointer rounded border border-slate-300"
      />
      <select
        value={palette.includes(value) ? value : ''}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-slate-300"
        title="快速選色"
      >
        <option value="">…</option>
        {palette.map((color) => (
          <option key={color} value={color} style={{ backgroundColor: color }} />
        ))}
      </select>
    </div>
  )
}
