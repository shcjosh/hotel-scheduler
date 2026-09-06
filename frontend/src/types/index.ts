export type ShiftType = 'A' | 'B' | 'C' | 'D' | 'M' | 'OFF' | 'SPECIAL'
export type EmployeeRole = 'general' | 'night' | 'cd_backup' | 'manager'
export type SchedulingMode = 'auto' | 'manual'
export type ScheduleStatus = 'draft' | 'published' | 'locked'

export interface LeaveType {
  code: string
  name: string
  color_bg: string
  color_text: string
  is_builtin: number
  is_active: number
}

export interface Employee {
  id: number
  name: string
  nickname: string | null
  tag: string | null
  sort_order: number
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
  sources: Record<string, string[]>
  leave_details: Record<string, Record<string, string>>
  status: ScheduleStatus
}

export interface SolveResponse {
  success: boolean
  schedule: Record<string, string[]> | null
  error: string | null
  solve_time: number
  violations: string[] | null
  objective_value: number | null
  soft_constraint_stats: Record<string, number> | null
  diagnostics: {
    likely_causes: { type: string; severity: string; message: string; suggestion: string }[]
    constraint_analysis: Record<string, number>
  } | null
  support_requests: {
    id: number; year: number; month: number; day: number; shift: string
    reason: string | null; status: string; source: string
  }[] | null
}
