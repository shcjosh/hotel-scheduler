import { useRef, useState } from 'react'
import { ChevronDown, Maximize2, Minimize2, Paintbrush, Rows3, X } from 'lucide-react'
import type { LeaveType } from '../../types'
import { getShiftStyle } from '../../utils/shift'
import { toolKey, type BrushTool, type ScheduleGroup } from '../../utils/brush'
import { useDismiss } from '../../hooks/useDismiss'
import { Button } from '../ui/button'
import { cn } from '../../utils/cn'

interface ScheduleToolbarProps {
  group: ScheduleGroup
  onGroupChange: (group: ScheduleGroup) => void
  tool: BrushTool | null
  onSelectTool: (tool: BrushTool) => void
  onClearTool: () => void
  leaveTypes: LeaveType[]
  dense: boolean
  onToggleDense: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  locked: boolean
}

const FRONT_SHIFTS = ['A', 'B', 'C', 'D', 'M', 'OFF']
const SUPPORT_SHIFTS = ['A1', 'C1', 'D1']
const HK_SHIFTS = ['A', 'OFF']

function toolLabel(tool: BrushTool | null, leaveTypes: LeaveType[]): string {
  if (!tool) return '畫筆'
  if (tool.kind === 'shift') return tool.shift === 'OFF' ? '休' : tool.shift
  return leaveTypes.find((lt) => lt.code === tool.code)?.name ?? tool.code
}

/** 班表工具列：櫃台／房務分頁、畫筆 popover、表格密度、全螢幕。 */
export function ScheduleToolbar({
  group,
  onGroupChange,
  tool,
  onSelectTool,
  onClearTool,
  leaveTypes,
  dense,
  onToggleDense,
  fullscreen,
  onToggleFullscreen,
  locked,
}: ScheduleToolbarProps) {
  const [brushOpen, setBrushOpen] = useState(false)
  const brushRef = useRef<HTMLDivElement>(null)
  useDismiss(brushRef, brushOpen, () => setBrushOpen(false))

  const activeKey = toolKey(tool)

  const shiftButtons = group === 'housekeeping' ? HK_SHIFTS : [...FRONT_SHIFTS, ...SUPPORT_SHIFTS]

  function choose(next: BrushTool) {
    if (toolKey(next) === activeKey) onClearTool()
    else onSelectTool(next)
    setBrushOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
      <div role="tablist" aria-label="班表類別" className="flex items-center gap-1">
        {(
          [
            { value: 'front', label: '櫃台' },
            { value: 'housekeeping', label: '房務' },
          ] as const
        ).map((tab) => {
          const active = group === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onGroupChange(tab.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {!locked && (
          <div className="relative" ref={brushRef}>
            <button
              type="button"
              onClick={() => setBrushOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={brushOpen}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                tool
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <Paintbrush className="h-3.5 w-3.5" aria-hidden="true" />
              {tool ? `畫筆：${toolLabel(tool, leaveTypes)}` : '畫筆'}
              {tool ? (
                <span
                  role="button"
                  aria-label="取消畫筆"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClearTool()
                  }}
                  className="ml-0.5 rounded p-0.5 hover:bg-brand-100"
                >
                  <X className="h-3 w-3" />
                </span>
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              )}
            </button>

            {brushOpen && (
              <div
                role="dialog"
                aria-label="選擇畫筆"
                className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-popover"
              >
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">班別</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {shiftButtons.map((shift) => {
                    const style = getShiftStyle(shift)
                    const active = activeKey === shift
                    return (
                      <button
                        key={shift}
                        type="button"
                        onClick={() => choose({ kind: 'shift', shift })}
                        className={cn(
                          'inline-flex h-7 min-w-8 items-center justify-center rounded px-2 text-xs font-bold transition',
                          style.bg,
                          style.text,
                          active
                            ? 'ring-2 ring-brand-600 ring-offset-1'
                            : 'opacity-80 hover:opacity-100',
                        )}
                        title={shift === 'D' ? '只能塗在大夜專職格位' : undefined}
                      >
                        {style.label}
                      </button>
                    )
                  })}
                </div>

                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">假別</p>
                <div className="flex flex-wrap gap-1.5">
                  {leaveTypes.map((lt) => {
                    const active = activeKey === `LT:${lt.code}`
                    return (
                      <button
                        key={lt.code}
                        type="button"
                        onClick={() => choose({ kind: 'leave', code: lt.code })}
                        style={{ backgroundColor: lt.color_bg, color: lt.color_text }}
                        className={cn(
                          'inline-flex h-7 items-center justify-center rounded px-2.5 text-xs font-bold transition',
                          active
                            ? 'ring-2 ring-brand-600 ring-offset-1'
                            : 'opacity-80 hover:opacity-100',
                        )}
                      >
                        {lt.name}
                      </button>
                    )
                  })}
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  選好畫筆後單擊格子即可暫存；按住拖曳可連續塗多格。
                </p>
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDense}
          title={dense ? '切換為寬鬆列高' : '切換為精簡列高'}
        >
          <Rows3 className="mr-1 h-3.5 w-3.5" />
          {dense ? '精簡' : '寬鬆'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleFullscreen}
          title={fullscreen ? '退出全螢幕' : '全螢幕檢視'}
        >
          {fullscreen ? (
            <Minimize2 className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="mr-1 h-3.5 w-3.5" />
          )}
          {fullscreen ? '退出全螢幕' : '全螢幕'}
        </Button>
      </div>
    </div>
  )
}
