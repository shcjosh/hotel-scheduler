import { cn } from '../../utils/cn'

interface ConsecutiveOffCounterProps {
  count: number
  max?: number
}

export function ConsecutiveOffCounter({ count, max = 2 }: ConsecutiveOffCounterProps) {
  const reached = count >= max
  const color =
    count === 0
      ? 'bg-gray-100 text-gray-600'
      : reached
        ? 'bg-orange-100 text-orange-700'
        : 'bg-blue-100 text-blue-700'
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm">
      <span className="text-gray-600">連休 2 日</span>
      <span className={cn('rounded px-2 py-0.5 font-semibold', color)}>
        {count} / {max}
      </span>
      {reached && <span className="text-xs text-orange-600">已達上限</span>}
    </div>
  )
}
