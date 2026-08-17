import { apiClient } from './client'

export interface NightEmployee {
  id: number
  name: string
}

export interface BackupRequestData {
  id: number
  year: number
  month: number
  day: number
  status: string
  assigned_employee_id: number | null
}

export interface NightScheduleData {
  night_schedule: Record<string, Record<string, string>>
  night_employees: NightEmployee[]
  d_backup_requests: BackupRequestData[]
}

export interface NightViolation {
  rule: string
  message: string
}

export async function getNightSchedule(
  year: number,
  month: number,
): Promise<NightScheduleData> {
  const { data } = await apiClient.get<NightScheduleData>(
    `/night/${year}/${month}`,
  )
  return data
}

export async function saveNightEntry(
  year: number,
  month: number,
  day: number,
  empId: number,
  shift: 'D' | 'OFF',
): Promise<NightScheduleData> {
  const { data } = await apiClient.put<NightScheduleData>(
    `/night/${year}/${month}/${day}`,
    { employee_id: empId, shift },
  )
  return data
}

export async function deleteNightEntry(
  year: number,
  month: number,
  day: number,
  empId: number,
): Promise<NightScheduleData> {
  const { data } = await apiClient.delete<NightScheduleData>(
    `/night/${year}/${month}/${day}`,
    { data: { employee_id: empId } },
  )
  return data
}

export async function getNightValidation(
  year: number,
  month: number,
): Promise<{ violations: NightViolation[] }> {
  const { data } = await apiClient.get(`/night/${year}/${month}/validation`)
  return data
}

export async function addBackupRequest(
  year: number,
  month: number,
  day: number,
): Promise<BackupRequestData> {
  const { data } = await apiClient.post<BackupRequestData>(
    '/night/backup-request',
    { year, month, day },
  )
  return data
}

export async function removeBackupRequest(id: number): Promise<void> {
  await apiClient.delete(`/night/backup-request/${id}`)
}
