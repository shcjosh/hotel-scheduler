import { apiClient } from './client'

export interface EmployeeStats {
  employee_id: number
  employee_name: string
  role: string
  shift_counts: Record<string, number>
  total_work_days: number
  total_off_days: number
  total_special_days: number
  leave_type_counts: Record<string, number>
  total_leave_days: number
  weekend_work_count: number
  max_consecutive_work: number
  consecutive_off_count: number
  preferred_satisfied: number
}

export interface ShiftStats {
  total: number
  per_day_avg: number
  min: number
  max: number
}

export interface DailyCoverageStats {
  day: number
  weekday: number
  A: number
  B: number
  C: number
  D: number
  M: number
  total: number
}

export interface MonthStats {
  month_summary: {
    year: number
    month: number
    num_days: number
    total_shifts: number
    solve_status: string
    objective_value: number | null
    solve_time: number | null
  }
  per_employee: EmployeeStats[]
  per_shift: Record<string, ShiftStats>
  daily_coverage: DailyCoverageStats[]
  weekend_summary: {
    saturdays: { day: number; workers: string[]; shifts: string[] }[]
    sundays: { day: number; workers: string[]; shifts: string[] }[]
  }
  violations_summary: {
    total_violations: number
    hard_violations: number
    soft_warnings: number
    is_valid: boolean
  }
  soft_constraint_stats: Record<string, number> | null
  leave_types: { code: string; name: string; color_bg: string; color_text: string }[]
}

export async function getMonthStats(year: number, month: number): Promise<MonthStats> {
  const { data } = await apiClient.get<MonthStats>(`/stats/${year}/${month}`)
  return data
}
