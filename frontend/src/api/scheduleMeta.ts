import { apiClient } from './client'
import type { ScheduleStatus } from '../types'

export interface ScheduleSnapshot {
  id: number
  year: number
  month: number
  version_number: string
  name: string
  created_at: string
}

export interface ChangeLogEntry {
  id: number
  year: number
  month: number
  employee_id: number
  day: number
  old_shift: string
  new_shift: string
  reason: string | null
  created_at: string
}

export interface SnapshotDiffChange {
  employee_id: number
  employee_name: string | null
  day: number
  old_shift: string | null
  new_shift: string | null
}

export async function getScheduleStatus(
  year: number,
  month: number,
): Promise<{ year: number; month: number; status: ScheduleStatus }> {
  const { data } = await apiClient.get(`/schedule-status/${year}/${month}`)
  return data
}

export async function setScheduleStatus(
  year: number,
  month: number,
  status: ScheduleStatus,
): Promise<{ year: number; month: number; status: ScheduleStatus }> {
  const { data } = await apiClient.put(`/schedule-status/${year}/${month}`, { status })
  return data
}

export async function getSnapshots(year: number, month: number): Promise<ScheduleSnapshot[]> {
  const { data } = await apiClient.get<ScheduleSnapshot[]>(`/snapshots/${year}/${month}`)
  return data
}

export async function createSnapshot(
  year: number,
  month: number,
  name?: string,
): Promise<ScheduleSnapshot> {
  const { data } = await apiClient.post<ScheduleSnapshot>(`/snapshots/${year}/${month}`, { name })
  return data
}

export async function restoreSnapshot(id: number): Promise<ScheduleSnapshot> {
  const { data } = await apiClient.post<ScheduleSnapshot>(`/snapshots/${id}/restore`)
  return data
}

export async function diffSnapshots(
  aId: number,
  bId: number,
): Promise<{ changes: SnapshotDiffChange[] }> {
  const { data } = await apiClient.get(`/snapshots/diff/${aId}/${bId}`)
  return data
}

export async function getChangeLogs(year: number, month: number): Promise<ChangeLogEntry[]> {
  const { data } = await apiClient.get<ChangeLogEntry[]>(`/change-logs/${year}/${month}`)
  return data
}
