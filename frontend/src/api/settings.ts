import { apiClient } from './client'

export async function getSettings(): Promise<{ hotel_name: string; user_name: string }> {
  const { data } = await apiClient.get<{ hotel_name: string; user_name: string }>('/settings')
  return data
}

export async function updateSetting(key: string, value: string): Promise<string> {
  const { data } = await apiClient.put<{ value: string }>(`/settings/${key}`, { value })
  return data.value
}
