import { apiClient } from './client'

export interface AnnualLeavePeriod {
  period_start: string
  period_end: string
  years: number
  entitlement: number
  entitlement_law: number
  entitlement_override: number | null
  opening_used_days: number
  system_days: number
  manual_days: number
  used_days: number
  remaining: number
  note: string | null
}

export interface AnnualLeaveManualEntry {
  id: number
  date: string
  days: number
  note: string | null
}

export interface AnnualLeaveEmployee {
  hire_date: string | null
  seniority_years: number | null
  periods: AnnualLeavePeriod[]
  manual_entries: AnnualLeaveManualEntry[]
}

export interface AnnualLeaveSummary {
  employees: Record<string, AnnualLeaveEmployee>
}

export async function getAnnualLeave(
  year: number,
  month: number,
): Promise<AnnualLeaveSummary> {
  const { data } = await apiClient.get<AnnualLeaveSummary>(
    `/annual-leave/${year}/${month}`,
  )
  return data
}

export async function upsertAdjustment(payload: {
  employee_id: number
  period_start: string
  opening_used_days: number
  entitlement_override: number | null
  note?: string | null
}): Promise<void> {
  await apiClient.put('/annual-leave/adjustment', payload)
}

export async function addManualEntry(
  employeeId: number,
  date: string,
  days: number,
  note?: string,
): Promise<void> {
  await apiClient.post('/annual-leave/manual-entries', {
    employee_id: employeeId,
    date,
    days,
    note,
  })
}

export async function deleteManualEntry(entryId: number): Promise<void> {
  await apiClient.delete(`/annual-leave/manual-entries/${entryId}`)
}
