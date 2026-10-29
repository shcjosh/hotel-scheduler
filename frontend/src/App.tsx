import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { SchedulePage } from './pages/SchedulePage'
import {
  EmployeesPage,
  OffDaysPage,
  CrossMonthPage,
  StatsPage,
  HousekeepingPage,
} from './pages'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/housekeeping" element={<HousekeepingPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/off-days" element={<OffDaysPage />} />
          <Route path="/cross-month" element={<CrossMonthPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
