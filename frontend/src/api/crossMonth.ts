import { apiClient } from './client'

export interface CrossMonthLink {
  employee_id: number
  day_5_shift: string | null
  day_4_shift: string | null
  day_3_shift: string | null
  day_2_shift: string | null
  day_1_shift: string | null
  source: string
}

export interface CrossMonthData {
  previous_month_links: Record<string, CrossMonthLink>
  prev_month_name: string
  prev_last_5_dates: string[]
}

export interface CrossMonthViolation {
  employee_id: number
  employee_name: string
  type: string
  rule: string
  message: string
}

export interface CrossMonthWeekSummary {
  employee_id: number
  employee_name: string
  prev_week_off_count: number
  curr_week_off_count: number | null
  remaining_off: number
  at_limit: boolean
}

export interface CrossMonthPreview {
  violations: CrossMonthViolation[]
  cross_month_week_summary: CrossMonthWeekSummary[]
}

export async function getCrossMonth(
  year: number,
  month: number,
  reload = false,
): Promise<CrossMonthData> {
  const { data } = await apiClient.get<CrossMonthData>(
    `/cross-month/${year}/${month}`,
    { params: reload ? { reload: true } : undefined },
  )
  return data
}

export async function saveCrossMonth(
  year: number,
  month: number,
  links: CrossMonthLink[],
): Promise<CrossMonthData> {
  const { data } = await apiClient.post<CrossMonthData>(
    `/cross-month/${year}/${month}`,
    { links },
  )
  return data
}

export async function getCrossMonthPreview(
  year: number,
  month: number,
): Promise<CrossMonthPreview> {
  const { data } = await apiClient.get<CrossMonthPreview>(
    `/cross-month/preview/${year}/${month}`,
  )
  return data
}
