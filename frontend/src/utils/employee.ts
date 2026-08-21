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
