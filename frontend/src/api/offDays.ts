import { apiClient } from './client'

export interface OffDayData {
  designated_off_days: Record<string, number[]>
  special_leaves: Record<string, number[]>
}

export interface EmployeeOffSummary {
  consecutive_off_count: number
  consecutive_off_days: number[]
  designated_count: number
  special_count: number
}

export type OffDaySummary = Record<string, EmployeeOffSummary>

export async function getOffDays(year: number, month: number): Promise<OffDayData> {
  const { data } = await apiClient.get<OffDayData>(`/off-days/${year}/${month}`)
  return data
}

export async function getOffDaySummary(
  year: number,
  month: number,
): Promise<OffDaySummary> {
  const { data } = await apiClient.get<OffDaySummary>(
    `/off-days/summary/${year}/${month}`,
  )
  return data
}

export async function addDesignatedOff(
  empId: number,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  await apiClient.post('/off-days/designated', {
    employee_id: empId,
    year,
    month,
    day,
  })
}

export async function removeDesignatedOff(
  empId: number,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  await apiClient.delete(
    `/off-days/designated/${empId}/${year}/${month}/${day}`,
  )
}

export async function addSpecialLeave(
  empId: number,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  await apiClient.post('/off-days/special', {
    employee_id: empId,
    year,
    month,
    day,
  })
}

export async function removeSpecialLeave(
  empId: number,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  await apiClient.delete(`/off-days/special/${empId}/${year}/${month}/${day}`)
}
