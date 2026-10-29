import type { ScheduleStatus } from '../types'

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  draft: '草稿',
  published: '已發布',
  locked: '已鎖定',
}

export function statusLabel(status: ScheduleStatus): string {
  return STATUS_LABELS[status]
}
