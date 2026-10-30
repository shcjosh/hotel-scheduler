import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Upload } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { getDatabaseInfo, downloadDatabase, importDatabase } from '../../api/database'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function DatabaseBackupSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['database-info'],
    queryFn: () => getDatabaseInfo(),
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(true)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  function handleFile(file: File | undefined) {
    if (!file || busy) return
    setPendingFile(file)
  }

  async function runImport(file: File) {
    setBusy(true)
    setMessage(null)
    try {
      const r = await importDatabase(file)
      setMessageOk(true)
      setMessage(
        `匯入成功：員工 ${r.imported.employees} 人・班表格 ${r.imported.schedule_entries} 筆・` +
          `快照 ${r.imported.snapshots} 個` +
          (r.backup ? `（舊庫已備份為 ${r.backup}）` : '') +
          '，2 秒後重新載入頁面…',
      )
      window.setTimeout(() => window.location.reload(), 2500)
    } catch (e) {
      setMessageOk(false)
      setMessage(e instanceof Error ? e.message : '匯入失敗')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {isLoading && '讀取資料庫資訊…'}
          {isError && <span className="text-red-600">讀取失敗</span>}
          {data && (
            <span>
              資料庫 {formatSize(data.db_size_bytes)}（版本 {data.app_version}，
              更新 {data.db_mtime}）・員工 {data.counts.employees} 人・
              班表格 {data.counts.schedule_entries} 筆・快照 {data.counts.snapshots} 個
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadDatabase()} className="text-gray-700">
            <Database className="mr-2 h-4 w-4" /> 下載資料庫
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-gray-700"
          >
            <Upload className="mr-2 h-4 w-4" /> {busy ? '匯入中…' : '匯入資料庫'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".db"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      </div>
      {message && (
        <div
          className={`mt-2 rounded-md px-3 py-2 text-sm ${
            messageOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {message}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400">
        整庫備份（含全部月份、設定、快照），用於離線版 ↔ Docker 版同步（拿到另一邊匯入）。
        下載檔為標準 SQLite，可直接以同版本程式開啟。
      </p>

      <ConfirmDialog
        open={pendingFile !== null}
        title="用備份覆蓋整庫？"
        description={
          pendingFile
            ? `確定要用「${pendingFile.name}」覆蓋整庫嗎？這是整庫覆蓋、不是合併；當前資料會先自動備份，仍建議先下載備份。`
            : undefined
        }
        confirmLabel="覆蓋匯入"
        loading={busy}
        onCancel={() => setPendingFile(null)}
        onConfirm={() => {
          const file = pendingFile
          setPendingFile(null)
          if (file) void runImport(file)
        }}
      />
    </div>
  )
}
