import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { SchedulePage } from './pages/SchedulePage'
import { EmployeesPage, OffDaysPage, StatsPage, SettingsPage } from './pages'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SchedulePage />} />
          {/* v1.3.0：房務併入班表分頁，保留舊書籤轉址 */}
          <Route path="/housekeeping" element={<Navigate to="/?group=housekeeping" replace />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/off-days" element={<OffDaysPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* v1.3.0：跨月設定併入排班規則 */}
          <Route path="/cross-month" element={<Navigate to="/settings?tab=cross-month" replace />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
