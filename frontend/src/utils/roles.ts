import type { EmployeeRole, SchedulingMode } from '../types'

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  general: '一般櫃台',
  night: '大夜專職',
  cd_backup: 'C+D 備援（舊）',
  manager: '管理職',
  housekeeping: '房務',
  trainee: '見習生',
}

/** 員工表單可供選擇的身分（v1.4.0 起不再新增 cd_backup；勾選 D 班之自動人員即納入 D 備援）。 */
export const SELECTABLE_ROLES: EmployeeRole[] = [
  'general',
  'night',
  'manager',
  'trainee',
  'housekeeping',
]

export const ROLE_DEFAULTS: Record<
  EmployeeRole,
  { shifts: string[]; preferred: string | null; mode: SchedulingMode }
> = {
  general: { shifts: ['A', 'B', 'C'], preferred: null, mode: 'auto' },
  night: { shifts: ['D'], preferred: 'D', mode: 'manual' },
  cd_backup: { shifts: ['C', 'D'], preferred: 'C', mode: 'auto' },
  manager: { shifts: ['M', 'A', 'B', 'C', 'D'], preferred: 'M', mode: 'auto' },
  // 房務：只上 A（09:00-18:00），完全手動、與櫃台互不干涉。
  housekeeping: { shifts: ['A'], preferred: 'A', mode: 'manual' },
  // 見習生：預設日班 A/B/C，全職自動排班；不能單獨卡班（H15），需非見習同行。
  trainee: { shifts: ['A', 'B', 'C'], preferred: null, mode: 'auto' },
}

export const ALL_SHIFTS = ['A', 'B', 'C', 'D', 'M']
