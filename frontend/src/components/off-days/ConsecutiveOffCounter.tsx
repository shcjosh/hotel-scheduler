import { cn } from '../../utils/cn'

interface ConsecutiveOffCounterProps {
  count: number
  target?: number
}

export function ConsecutiveOffCounter({ count, target = 2 }: ConsecutiveOffCounterProps) {
  const ok = count === target
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm">
      <span className="text-gray-600">連休次數</span>
      <span
        className={cn(
          'rounded px-2 py-0.5 font-semibold',
          ok ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700',
        )}
      >
        {count} / {target}
      </span>
      <span className={cn('text-xs', ok ? 'text-green-600' : 'text-orange-600')}>
        {ok ? '符合' : `應為 ${target} 次`}
      </span>
    </div>
  )
}
