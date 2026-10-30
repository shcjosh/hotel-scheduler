import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileReadOnlyBanner } from './MobileReadOnlyBanner'
import { UpdateBanner } from './UpdateBanner'

export function Layout() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <MobileReadOnlyBanner />
        <UpdateBanner />
        <main className="hs-scroll flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
