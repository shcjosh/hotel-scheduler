import { useCallback, useEffect, useRef, useState } from 'react'
import type { Employee } from '../types'
import {
  isNoopChange,
  pendingKey,
  targetForTool,
  type BrushTool,
  type PendingChange,
  type ScheduleGroup,
} from '../utils/brush'

interface UseScheduleBrushOptions {
  group: ScheduleGroup
  employees: Employee[]
  /** 取得該格目前（未暫存前）的班別與假別代碼。 */
  getOriginal: (empName: string, day: number) => { shift: string; leaveType?: string | null }
  patch: (key: string, change: PendingChange | null) => void
}

/**
 * 畫筆：工具狀態 + 單擊／拖曳連選。
 * 點在「已經相同」的格子上會取消該格暫存（與舊行為一致）。
 * 拖曳時 mouseup 後緊接的 click 會被吞掉，避免把剛塗好的格子又取消。
 */
export function useScheduleBrush({ group, employees, getOriginal, patch }: UseScheduleBrushOptions) {
  const [tool, setTool] = useState<BrushTool | null>(null)
  const dragRef = useRef(false)
  const suppressClickRef = useRef(false)
  const toolRef = useRef(tool)
  toolRef.current = tool

  const paint = useCallback(
    (empName: string, day: number) => {
      const activeTool = toolRef.current
      if (!activeTool) return
      const employee = employees.find((item) => item.name === empName)
      if (!employee) return
      const change = targetForTool(activeTool, employee, group)
      if (!change) return
      const original = getOriginal(empName, day)
      const key = pendingKey(empName, day)
      if (isNoopChange(change, original.shift, original.leaveType)) patch(key, null)
      else patch(key, change)
    },
    [employees, getOriginal, group, patch],
  )

  useEffect(() => {
    function endDrag() {
      dragRef.current = false
      // 讓 mouseup 後同一個 task 的 click 先被吞掉，再恢復正常點擊
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [])

  const onPointerDown = useCallback(
    (empName: string, day: number) => {
      if (!toolRef.current) return
      suppressClickRef.current = true
      dragRef.current = true
      paint(empName, day)
    },
    [paint],
  )

  const onPointerEnter = useCallback(
    (empName: string, day: number) => {
      if (!toolRef.current || !dragRef.current) return
      paint(empName, day)
    },
    [paint],
  )

  /** 回傳 true = 這次 click 是拖曳的尾端，不要再處理。 */
  const consumeDragClick = useCallback((): boolean => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  const clearTool = useCallback(() => setTool(null), [])

  return {
    tool,
    setTool,
    clearTool,
    isActive: tool !== null,
    paint,
    onPointerDown,
    onPointerEnter,
    consumeDragClick,
  }
}
