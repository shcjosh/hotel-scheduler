import { apiClient } from './client'
import type { MonthScheduleView } from '../types'

export interface CellViolation {
  rule: string
  severity: string
  message: string
}

export interface ValidateCellResult {
  violations: CellViolation[]
  warnings: CellViolation[]
}

export interface RuleStat {
  violations: number
  description: string
}

export interface ValidationReport {
  summary: {
    total_violations: number
    hard_violations: number
    soft_warnings: number
    is_valid: boolean
  }
  violations: (CellViolation & { employee_id: number | null; employee_name: string | null; day: number | null })[]
  warnings: (CellViolation & { employee_id: number | null; employee_name: string | null; day: number | null })[]
  per_rule_summary: Record<string, RuleStat>
  disabled_night_rules?: Record<string, string[]>
}

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
): Promise<MonthScheduleView> {
  const { data } = await apiClient.put<MonthScheduleView>(
    `/schedules/${employeeId}/${year}/${month}/${day}`,
    { shift },
  )
  return data
}

export async function validateCell(
  employeeId: number,
  year: number,
  month: number,
  day: number,
  newShift: string,
): Promise<ValidateCellResult> {
  const { data } = await apiClient.post<ValidateCellResult>(
    '/schedules/validate-cell',
    {
      employee_id: employeeId,
      year,
      month,
      day,
      new_shift: newShift,
    },
  )
  return data
}

export async function getValidationReport(
  year: number,
  month: number,
): Promise<ValidationReport> {
  const { data } = await apiClient.get<ValidationReport>(
    `/schedules/${year}/${month}/validation`,
  )
  return data
}

export async function clearSchedule(
  year: number,
  month: number,
): Promise<{ cleared: number }> {
  const { data } = await apiClient.delete<{ cleared: number }>(
    `/schedules/${year}/${month}`,
  )
  return data
}
