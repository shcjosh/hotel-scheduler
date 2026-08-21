import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { SchedulePage } from './pages/SchedulePage'
import {
  EmployeesPage,
  OffDaysPage,
  CrossMonthPage,
  NightPage,
  StatsPage,
} from './pages'

const TITLES: Record<string, string> = {
  '/': '飯店排班系統',
  '/employees': '員工管理',
  '/off-days': '休假管理',
  '/cross-month': '跨月設定',
  '/night': '大夜班表',
  '/stats': '統計報表',
}

function CurrentTitle() {
  const { pathname } = useLocation()
  return <Layout title={TITLES[pathname] ?? '飯店排班系統'} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<CurrentTitle />}>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/off-days" element={<OffDaysPage />} />
          <Route path="/cross-month" element={<CrossMonthPage />} />
          <Route path="/night" element={<NightPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
