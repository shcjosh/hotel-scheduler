export function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function getWeekday(year: number, month: number, day: number): number {
  const d = new Date(year, month - 1, day)
  return d.getDay()
}

export function getWeekdayLabel(weekday: number): string {
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  return labels[weekday] ?? ''
}

export function isWeekend(year: number, month: number, day: number): boolean {
  const w = getWeekday(year, month, day)
  return w === 0 || w === 6
}
