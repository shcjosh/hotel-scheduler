import { BarChart3, CalendarDays, CalendarOff, CalendarRange, Sparkles, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** 由 Sidebar 填入的 badge 來源（Phase 1 只有班表狀態）。 */
  badge?: 'schedule-status'
  /** 路由標題（Header 顯示），預設與 label 相同。 */
  title?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * 導覽與路由的單一來源：Sidebar、Header 標題、App 路由都讀這份，
 * 避免多處各寫一份 title map。
 *
 * Phase 3 會加入「排班規則（/settings）」；Phase 2 會把房務併成班表分頁，
 * 屆時只需改這裡與 App.tsx。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: '本月作業',
    items: [
      { path: '/', label: '排班表', icon: CalendarDays, badge: 'schedule-status' },
      { path: '/housekeeping', label: '房務班表', icon: Sparkles },
      { path: '/off-days', label: '休假管理', icon: CalendarOff },
    ],
  },
  {
    label: '資料設定',
    items: [
      { path: '/employees', label: '員工管理', icon: Users },
      { path: '/cross-month', label: '跨月設定', icon: CalendarRange },
    ],
  },
  {
    label: '分析與輸出',
    items: [{ path: '/stats', label: '統計報表', icon: BarChart3 }],
  },
]

const ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function titleForPath(pathname: string): string {
  const item = ITEMS.find((entry) => entry.path === pathname)
  return item?.title ?? item?.label ?? '飯店排班系統'
}
