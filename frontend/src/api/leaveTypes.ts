import { apiClient } from './client'
import type { LeaveType } from '../types'

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const { data } = await apiClient.get<LeaveType[]>('/leave-types')
  return data
}

export async function createLeaveType(
  name: string,
  color_bg: string,
  color_text: string,
): Promise<LeaveType> {
  const { data } = await apiClient.post<LeaveType>('/leave-types', {
    name,
    color_bg,
    color_text,
  })
  return data
}

export async function updateLeaveType(
  code: string,
  payload: { name?: string; color_bg?: string; color_text?: string },
): Promise<LeaveType> {
  const { data } = await apiClient.put<LeaveType>(`/leave-types/${code}`, payload)
  return data
}

export async function deleteLeaveType(code: string): Promise<void> {
  await apiClient.delete(`/leave-types/${code}`)
}
