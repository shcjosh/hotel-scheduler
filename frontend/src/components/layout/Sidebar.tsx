import { NavLink } from 'react-router-dom'
import {
  CalendarDays,
  Users,
  CalendarOff,
  CalendarRange,
  Moon,
  BarChart3,
} from 'lucide-react'
import { cn } from '../../utils/cn'

const navItems = [
  { to: '/', label: '排班表', icon: CalendarDays },
  { to: '/off-days', label: '休假管理', icon: CalendarOff },
  { to: '/cross-month', label: '跨月設定', icon: CalendarRange },
  { to: '/night', label: '大夜班表', icon: Moon },
  { to: '/employees', label: '員工管理', icon: Users },
  { to: '/stats', label: '統計報表', icon: BarChart3 },
]

export function Sidebar() {
  return (
    <aside className="flex h-full w-[200px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
        <CalendarDays className="h-5 w-5 text-indigo-600" />
        <span className="font-semibold text-gray-800">飯店排班</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
