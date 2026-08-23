import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { checkForUpdates } from '../../api/updates'

export function UpdateBanner() {
  const { data } = useQuery({
    queryKey: ['updates'],
    queryFn: () => checkForUpdates(),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 0,
  })

  if (!data?.has_update) return null

  return (
    <div className="flex items-center justify-between gap-4 bg-indigo-50 px-6 py-2 text-sm text-indigo-800">
      <span>
        有新版本 <strong>{data.latest_version}</strong>（目前 v{data.current_version}）
        {data.name ? ` — ${data.name}` : ''}
      </span>
      {data.latest_url && (
        <a
          href={data.latest_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline hover:text-indigo-600"
        >
          查看更新 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}