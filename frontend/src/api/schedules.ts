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
  leaveType?: string,
  reason?: string,
): Promise<MonthScheduleView> {
  const { data } = await apiClient.put<MonthScheduleView>(
    `/schedules/${employeeId}/${year}/${month}/${day}`,
    { shift, leave_type: leaveType, reason },
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

export interface AdjustChange {
  employee_id: number
  day: number
  new_shift: string
  leave_type?: string | null
}

export interface AdjustChangeDetail extends AdjustChange {
  employee_name: string
  old_shift: string
}

export interface AdjustPreviewResult {
  success: boolean
  error?: string | null
  diagnostics?: {
    likely_causes: { type: string; severity: string; message: string; suggestion: string }[]
  } | null
  schedule?: Record<string, string[]> | null
  changes: AdjustChangeDetail[]
  affected_employee_ids: number[]
  affected_count: number
  solve_time?: number
}

export async function adjustPreview(
  year: number,
  month: number,
  employeeId: number,
  days: number[],
  leaveType: string,
): Promise<AdjustPreviewResult> {
  const { data } = await apiClient.post<AdjustPreviewResult>(
    '/schedules/adjust/preview',
    { year, month, employee_id: employeeId, days, leave_type: leaveType },
  )
  return data
}

export async function adjustApply(
  year: number,
  month: number,
  changes: AdjustChange[],
  reason?: string,
): Promise<{ applied: number }> {
  const { data } = await apiClient.post<{ applied: number }>(
    '/schedules/adjust/apply',
    { year, month, changes, reason },
  )
  return data
}
