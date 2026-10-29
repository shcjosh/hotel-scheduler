import type { MonthScheduleView } from '../types'

/**
 * PDF 休假線條規則（與櫃台 xlsx 一致）：
 * - 以週一～週日為一週
 * - 該週第 1 個 OFF → 單斜線 `/`
 * - 該週第 2 個 OFF → 交叉 `X`
 * - 跨月一起計算（例如 1/3 可能是該週第 2 個休）
 * - SPECIAL（特休/病假/事假…）不畫線，仍顯示文字
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 回傳該日期所屬週的週一（YYYY-MM-DD），以 UTC 計算避免時區/日光節約誤差。 */
export function mondayKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  const mondayOffset = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - mondayOffset)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/**
 * 建立某員工在「所有載入月份」中的休假序號：
 * date(YYYY-MM-DD) -> 0=該週第一休, 1=該週第二休, 2+=第三個以上。
 */
export interface OffDate {
  year: number
  month: number
  day: number
}

export function buildOffIndex(
  views: MonthScheduleView[],
  employeeName: string,
  extraOffDates: OffDate[] = [],
): Map<string, number> {
  const weeks = new Map<string, Set<string>>()

  function addOff(year: number, month: number, day: number) {
    const iso = isoDate(year, month, day)
    const week = mondayKey(year, month, day)
    let dates = weeks.get(week)
    if (!dates) {
      dates = new Set()
      weeks.set(week, dates)
    }
    dates.add(iso)
  }

  for (const view of views) {
    const row = view.schedule?.[employeeName]
    if (!row) continue
    for (let i = 0; i < view.num_days; i++) {
      if (row[i] !== 'OFF') continue
      addOff(view.year, view.month, i + 1)
    }
  }

  // 上月班表不存在時，用跨月設定的上月末休假補足第一週的順序。
  for (const d of extraOffDates) addOff(d.year, d.month, d.day)

  const index = new Map<string, number>()
  for (const dates of weeks.values()) {
    Array.from(dates)
      .sort()
      .forEach((iso, i) => index.set(iso, i))
  }
  return index
}

export function buildOffIndexByEmployee(
  views: MonthScheduleView[],
  employeeNames: string[],
  extraOffDatesByEmployee?: Record<string, OffDate[]>,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const name of employeeNames) {
    result.set(name, buildOffIndex(views, name, extraOffDatesByEmployee?.[name] ?? []))
  }
  return result
}
