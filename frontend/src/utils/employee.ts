import type { Employee } from '../types'

export function displayName(e: Pick<Employee, 'name' | 'nickname'>): string {
  return e.nickname ? `${e.nickname} ${e.name}` : e.name
}

export function nameMap(employees: Employee[]): Map<string, string> {
  return new Map(employees.map((e) => [e.name, displayName(e)]))
}

export function avatarText(e: Pick<Employee, 'name' | 'nickname'>): string {
  const s = (e.nickname || e.name || '').trim()
  return s ? s.charAt(0).toUpperCase() : '?'
}

const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-600',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-600',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
]

export function avatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

/** 員工在指定月份是否可見（到職月及之後、最後上班月及之前可見）。 */
export function isVisibleInMonth(
  e: Pick<Employee, 'hire_date' | 'resign_date'>,
  year: number,
  month: number,
): boolean {
  const key = `${year}-${String(month).padStart(2, '0')}`
  if (e.resign_date && e.resign_date.slice(0, 7) < key) return false
  if (e.hire_date && e.hire_date.slice(0, 7) > key) return false
  return true
}

export type OutOfEmploymentReason = 'before_hire' | 'after_resign' | null

/** 判斷指定日期是否落在員工到職日之前或離職日之後（含到職日與最後上班日當天為在職）。 */
export function outOfEmploymentReason(
  e: Pick<Employee, 'hire_date' | 'resign_date'> | undefined,
  year: number,
  month: number,
  day: number,
): OutOfEmploymentReason {
  if (!e) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (e.hire_date && iso < e.hire_date) return 'before_hire'
  if (e.resign_date && iso > e.resign_date) return 'after_resign'
  return null
}

/** 員工在指定日期是否在職。 */
export function isEmployedOn(
  e: Pick<Employee, 'hire_date' | 'resign_date'> | undefined,
  year: number,
  month: number,
  day: number,
): boolean {
  return outOfEmploymentReason(e, year, month, day) === null
}

/** 是否為房務（與櫃台班表互不干涉，櫃台相關頁面需排除）。 */
export function isHousekeeping(e: Pick<Employee, 'role'>): boolean {
  return e.role === 'housekeeping'
}
