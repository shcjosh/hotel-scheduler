import type { ShiftType } from '../types'

interface ShiftStyle {
  bg: string
  text: string
  label: string
}

export const SHIFT_COLORS: Record<string, ShiftStyle> = {
  A: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'A' },
  B: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'B' },
  C: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'C' },
  D: { bg: 'bg-indigo-900', text: 'text-white', label: 'D' },
  M: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'M' },
  OFF: { bg: 'bg-red-200', text: 'text-red-800', label: '休' },
  SPECIAL: { bg: 'bg-purple-300', text: 'text-purple-900', label: '特休' },
}

export function getShiftStyle(shift: string): ShiftStyle {
  return (
    SHIFT_COLORS[shift] ?? {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      label: shift || '-',
    }
  )
}

export const SHIFT_ORDER: ShiftType[] = ['A', 'B', 'C', 'D', 'M', 'OFF', 'SPECIAL']

export const SHIFT_DESCRIPTIONS: Record<string, string> = {
  A: 'A（早班 07:30-15:30）',
  B: 'B（中班 11:30-19:30）',
  C: 'C（晚班 15:30-23:30）',
  D: 'D（大夜 23:30-07:30）',
  M: 'M（管理 09:00-17:00）',
  OFF: '休',
  SPECIAL: '特休',
}
