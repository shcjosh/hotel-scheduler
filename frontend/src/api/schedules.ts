import { apiClient } from './client'
import type { MonthScheduleView } from '../types'

export async function getSchedule(
  year: number,
  month: number,
): Promise<MonthScheduleView> {
  const { data } = await apiClient.get<MonthScheduleView>(
    `/schedules/${year}/${month}`,
  )
  return data
}

export async function updateScheduleEntry(
  employeeId: number,
  year: number,
  month: number,
  day: number,
  shift: string,
): Promise<void> {
  await apiClient.put(`/schedules/${employeeId}/${year}/${month}/${day}`, {
    shift,
    source: 'manual',
  })
}
