import { apiClient } from './client'

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  has_update: boolean
  latest_url?: string
  name?: string
  published_at?: string
  notes?: string
  error?: string
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const { data } = await apiClient.get<UpdateCheckResult>('/updates/check')
  return data
}