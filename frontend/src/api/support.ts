import { apiClient } from './client'

export interface SupportRequest {
  id: number
  year: number
  month: number
  day: number
  shift: string
  reason: string | null
  status: string
  resolution: string | null
  source: string
  created_at: string
  resolved_at: string | null
}

export async function getSupportRequests(
  year: number,
  month: number,
): Promise<SupportRequest[]> {
  const { data } = await apiClient.get<SupportRequest[]>(
    `/support-requests/${year}/${month}`,
  )
  return data
}

export async function createSupportRequest(
  year: number,
  month: number,
  day: number,
  shift: string,
  reason: string,
): Promise<SupportRequest> {
  const { data } = await apiClient.post<SupportRequest>('/support-requests', {
    year, month, day, shift, reason,
  })
  return data
}

export async function updateSupportRequest(
  id: number,
  status: string,
  resolution: string | null,
): Promise<SupportRequest> {
  const { data } = await apiClient.put<SupportRequest>(`/support-requests/${id}`, {
    status, resolution,
  })
  return data
}

export async function deleteSupportRequest(id: number): Promise<void> {
  await apiClient.delete(`/support-requests/${id}`)
}
