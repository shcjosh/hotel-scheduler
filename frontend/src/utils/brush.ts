import type { Employee } from '../types'

export type ScheduleGroup = 'front' | 'housekeeping'

export interface PendingChange {
  shift: string
  leaveType?: string
}

export type PendingMap = Record<string, PendingChange>

export type BrushTool =
  | { kind: 'shift'; shift: string }
  | { kind: 'leave'; code: string }

export const LT_PREFIX = 'LT:'

export function toolKey(tool: BrushTool | null): string | null {
  if (!tool) return null
  return tool.kind === 'shift' ? tool.shift : `${LT_PREFIX}${tool.code}`
}

export function toolFromKey(key: string | null): BrushTool | null {
  if (!key) return null
  if (key.startsWith(LT_PREFIX)) return { kind: 'leave', code: key.slice(LT_PREFIX.length) }
  return { kind: 'shift', shift: key }
}

/**
 * 依「群組 + 員工角色」判斷該畫筆能不能塗在這位員工身上。
 * 規則與後端格位限制一致：
 * - 房務：只允許 A / OFF / 假別
 * - 二館支援（tag）：只允許 A1 / C1 / D1，不能塗假別
 * - 大夜：只允許 D / OFF / 假別
 * - 其他：不可塗 D（D 由大夜或備援指派）
 */
export function targetForTool(
  tool: BrushTool,
  employee: Employee,
  group: ScheduleGroup,
): PendingChange | null {
  if (group === 'housekeeping') {
    if (tool.kind === 'leave') return { shift: 'SPECIAL', leaveType: tool.code }
    return tool.shift === 'A' || tool.shift === 'OFF' ? { shift: tool.shift } : null
  }

  if (employee.tag) {
    if (tool.kind === 'leave') return null
    return ['A1', 'C1', 'D1'].includes(tool.shift) ? { shift: tool.shift } : null
  }

  if (tool.kind === 'leave') return { shift: 'SPECIAL', leaveType: tool.code }

  if (employee.role === 'night') {
    return tool.shift === 'D' || tool.shift === 'OFF' ? { shift: tool.shift } : null
  }

  return tool.shift === 'D' ? null : { shift: tool.shift }
}

/** 要塗的值與現況相同 → 視為「取消這格的暫存」。 */
export function isNoopChange(
  change: PendingChange,
  originalShift: string,
  originalLeaveType?: string | null,
): boolean {
  if (change.shift !== originalShift) return false
  const targetLeave = change.shift === 'SPECIAL' ? (change.leaveType ?? null) : null
  return targetLeave === (originalLeaveType ?? null)
}

export function pendingKey(empName: string, day: number): string {
  return `${empName}_${day}`
}

export function splitPendingKey(key: string): { empName: string; day: number } {
  const index = key.lastIndexOf('_')
  return { empName: key.slice(0, index), day: Number(key.slice(index + 1)) }
}
