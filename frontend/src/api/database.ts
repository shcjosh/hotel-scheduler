import { apiClient } from './client'

export interface DatabaseInfo {
  app_version: string
  db_size_bytes: number
  db_mtime: string
  counts: {
    employees: number
    schedule_entries: number
    snapshots: number
  }
}

export async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const { data } = await apiClient.get<DatabaseInfo>('/database/info')
  return data
}

export function downloadDatabase(): void {
  window.open('/api/v1/database/export', '_blank')
}

export interface DatabaseImportResult {
  backup: string | null
  imported: {
    employees: number
    schedule_entries: number
    snapshots: number
  }
}

function errorMessage(raw: unknown): string {
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return '匯入失敗'
  }
}

export async function importDatabase(file: File): Promise<DatabaseImportResult> {
  // 原生 fetch＋octet-stream：不經 axios，避免 multipart 依賴與 header 問題
  const res = await fetch('/api/v1/database/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(errorMessage(body?.detail) || `匯入失敗（${res.status}）`)
  }
  return res.json()
}
