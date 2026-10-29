import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Power } from 'lucide-react'
import { getSetting, getSettings, updateSetting } from '../../api/settings'
import { shutdownServer } from '../../api/lifecycle'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { Field, controlClassName } from '../ui/field'
import { useToast } from '../../hooks/useToast'
import { cn } from '../../utils/cn'

interface SettingRowProps {
  label: string
  value: string
  placeholder?: string
  /** 允許清空（例如分館名稱可留白）；其餘識別性欄位不允許。 */
  allowEmpty?: boolean
  onCommit: (value: string) => void
}

function SettingRow({ label, value, placeholder, allowEmpty = false, onCommit }: SettingRowProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  function commit() {
    const next = draft.trim()
    if (next === value) return
    if (!next && !allowEmpty) {
      setDraft(value)
      return
    }
    onCommit(next)
  }

  return (
    <Field label={label}>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        placeholder={placeholder}
        className={controlClassName}
      />
    </Field>
  )
}

/**
 * 使用者選單：顯示名稱、飯店／分館名稱編輯、「關閉系統」。
 * 原本裸露在 Header 的電源 icon 與行內編輯都收進這裡。
 */
export function UserMenu() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })
  // branch_name 只在列印時使用，GET /settings 未回傳，單獨讀取。
  const { data: branchSetting } = useQuery({
    queryKey: ['setting', 'branch_name'],
    queryFn: () => getSetting('branch_name'),
  })
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const userName = data?.user_name ?? 'Josh Wang'
  const hotelName = data?.hotel_name ?? '清翼居府中館'
  const branchName = branchSetting ?? ''

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateSetting(key, value),
    onSuccess: (_value, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['setting', variables.key] })
      toast('已儲存設定')
    },
    onError: (error) => {
      toast('設定儲存失敗', {
        tone: 'error',
        description: error instanceof Error ? error.message : '未知錯誤',
      })
    },
  })

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {userName.charAt(0) || '?'}
        </span>
        <span className="hidden max-w-[9rem] truncate sm:inline">{userName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-popover"
        >
          <div className="mb-3">
            <p className="text-sm font-semibold text-slate-800">{userName}</p>
            <p className="text-xs text-slate-500">{hotelName}</p>
          </div>

          <div className="space-y-3">
            <SettingRow
              label="使用者名稱（製表人）"
              value={userName}
              onCommit={(value) => saveMut.mutate({ key: 'user_name', value })}
            />
            <SettingRow
              label="飯店名稱"
              value={hotelName}
              onCommit={(value) => saveMut.mutate({ key: 'hotel_name', value })}
            />
            <SettingRow
              label="分館名稱（列印抬頭）"
              value={branchName}
              placeholder="例：板橋府中店(一館)"
              allowEmpty
              onCommit={(value) => saveMut.mutate({ key: 'branch_name', value })}
            />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirmOpen(true)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50',
              )}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
              關閉系統
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="關閉系統？"
        description="關閉後需重新開啟 hotel-scheduler.exe（或重新啟動服務）才能繼續使用。"
        confirmLabel="關閉系統"
        loading={false}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          shutdownServer()
        }}
      />
    </div>
  )
}
