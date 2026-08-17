import type { EmployeeRole, SchedulingMode } from '../types'

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  general: '一般員工',
  night: '大夜專職',
  cd_backup: 'C+D 備援',
  manager: '管理職',
}

export const ROLE_DEFAULTS: Record<
  EmployeeRole,
  { shifts: string[]; preferred: string | null; mode: SchedulingMode }
> = {
  general: { shifts: ['A', 'B', 'C'], preferred: null, mode: 'auto' },
  night: { shifts: ['D'], preferred: 'D', mode: 'manual' },
  cd_backup: { shifts: ['C', 'D'], preferred: 'C', mode: 'auto' },
  manager: { shifts: ['M', 'A', 'B', 'C', 'D'], preferred: 'M', mode: 'auto' },
}

export const ALL_SHIFTS = ['A', 'B', 'C', 'D', 'M']
