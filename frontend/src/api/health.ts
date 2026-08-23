import { apiClient } from './client'

export async function getHealth(): Promise<{ status: string; version: string }> {
  const { data } = await apiClient.get<{ status: string; version: string }>('/health')
  return data
}
