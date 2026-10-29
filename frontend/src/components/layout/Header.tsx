import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Menu } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { getSettings } from '../../api/settings'
import { titleForPath } from '../../config/navigation'
import { MonthNavigator } from './MonthNavigator'
import { UserMenu } from './UserMenu'

/**
 * 全域頁首：左＝目前模組（由路由決定）、中＝月份導覽與狀態、右＝使用者選單。
 * 頁面自己的標題／副標／動作交給 PageHeader，不在這裡重複。
 */
export function Header() {
  const { pathname } = useLocation()
  const { setMobileNavOpen } = useUIStore()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })

  const title = titleForPath(pathname)
  const hotelName = data?.hotel_name ?? '清翼居府中館'

  useEffect(() => {
    document.title = `${title} — ${hotelName} 排班系統`
  }, [title, hotelName])

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 md:px-6">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="開啟選單"
        className="rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">{title}</h1>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <MonthNavigator />
        <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  )
}
