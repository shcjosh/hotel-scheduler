export type ShiftType = 'A' | 'B' | 'C' | 'D' | 'OFF' | 'SPECIAL'
export type EmployeeRole = 'general' | 'night' | 'cd_backup'
export type SchedulingMode = 'auto' | 'manual'

export interface Employee {
  id: number
  name: string
  role: EmployeeRole
  available_shifts: string[]
  preferred_shift: string | null
  scheduling_mode: SchedulingMode
  is_active: number
  created_at: string
  updated_at: string
}

export interface ScheduleEntry {
  id: number
  employee_id: number
  year: number
  month: number
  day: number
  shift: string
  source: string
  created_at: string
  updated_at: string
}

export interface MonthScheduleView {
  year: number
  month: number
  num_days: number
  schedule: Record<string, string[]>
}

export interface SolveResponse {
  success: boolean
  schedule: Record<string, string[]> | null
  error: string | null
  solve_time: number
  violations: string[] | null
  objective_value: number | null
  soft_constraint_stats: Record<string, number> | null
}
