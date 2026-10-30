import { useCallback, useState, type KeyboardEvent } from 'react'

export interface GridCell {
  empIndex: number
  day: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 班表格的鍵盤選取：
 * - 方向鍵移動、Shift+方向鍵擴張範圍
 * - Enter 開編輯、Esc 取消
 * 選取狀態只影響視覺與編輯入口，不會動到資料。
 */
export function useGridSelection(
  names: string[],
  numDays: number,
  onOpen: (empName: string, day: number) => void,
) {
  const [anchor, setAnchor] = useState<GridCell | null>(null)
  const [focus, setFocus] = useState<GridCell | null>(null)

  const select = useCallback((empIndex: number, day: number, extend = false) => {
    setFocus({ empIndex, day })
    if (!extend) setAnchor({ empIndex, day })
  }, [])

  const clear = useCallback(() => {
    setAnchor(null)
    setFocus(null)
  }, [])

  const isSelected = useCallback(
    (empIndex: number, day: number) => {
      if (!anchor || !focus) return false
      const [fromRow, toRow] = [Math.min(anchor.empIndex, focus.empIndex), Math.max(anchor.empIndex, focus.empIndex)]
      const [fromDay, toDay] = [Math.min(anchor.day, focus.day), Math.max(anchor.day, focus.day)]
      return empIndex >= fromRow && empIndex <= toRow && day >= fromDay && day <= toDay
    },
    [anchor, focus],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (names.length === 0) return
      const current = focus ?? { empIndex: 0, day: 1 }
      const move = (rowDelta: number, dayDelta: number) => {
        const next = {
          empIndex: clamp(current.empIndex + rowDelta, 0, names.length - 1),
          day: clamp(current.day + dayDelta, 1, numDays),
        }
        setFocus(next)
        if (!event.shiftKey || !anchor) setAnchor(next)
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          move(-1, 0)
          break
        case 'ArrowDown':
          event.preventDefault()
          move(1, 0)
          break
        case 'ArrowLeft':
          event.preventDefault()
          move(0, -1)
          break
        case 'ArrowRight':
          event.preventDefault()
          move(0, 1)
          break
        case 'Home':
          event.preventDefault()
          move(0, -(numDays - 1))
          break
        case 'End':
          event.preventDefault()
          move(0, numDays - 1)
          break
        case 'Enter': {
          event.preventDefault()
          const cell = focus ?? { empIndex: 0, day: 1 }
          onOpen(names[cell.empIndex], cell.day)
          break
        }
        case 'Escape':
          event.preventDefault()
          clear()
          break
        default:
          break
      }
    },
    [anchor, clear, focus, names, numDays, onOpen],
  )

  return { anchor, focus, select, clear, isSelected, handleKeyDown }
}
