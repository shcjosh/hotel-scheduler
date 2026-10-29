import { create } from 'zustand'

/** 月份導覽的可選年份範圍（與 Header 的年/月選單一致）。 */
export const MIN_YEAR = 2025
export const MAX_YEAR = 2027

const SIDEBAR_KEY = 'hs.sidebarCollapsed'

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

interface UIState {
  currentYear: number
  currentMonth: number
  setCurrentYear: (year: number) => void
  setCurrentMonth: (month: number) => void
  /** 依 delta 加減月份（可跨年），超出 MIN_YEAR~MAX_YEAR 時不動。 */
  shiftMonth: (delta: number) => void
  /** 回到今天所在的月份。 */
  goToCurrentMonth: () => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  solveMaxTime: number
  solveEnableDBackup: boolean
  setSolveMaxTime: (seconds: number) => void
  setSolveEnableDBackup: (enabled: boolean) => void
}

const now = new Date()
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)

export const useUIStore = create<UIState>((set) => ({
  currentYear: next.getFullYear(),
  currentMonth: next.getMonth() + 1,
  setCurrentYear: (year) => set({ currentYear: year }),
  setCurrentMonth: (month) => set({ currentMonth: month }),
  shiftMonth: (delta) =>
    set((state) => {
      const total = state.currentYear * 12 + (state.currentMonth - 1) + delta
      const year = Math.floor(total / 12)
      const month = (total % 12) + 1
      if (year < MIN_YEAR || year > MAX_YEAR) return state
      return { currentYear: year, currentMonth: month }
    }),
  goToCurrentMonth: () => {
    const today = new Date()
    set({ currentYear: today.getFullYear(), currentMonth: today.getMonth() + 1 })
  },
  sidebarCollapsed: readSidebarCollapsed(),
  setSidebarCollapsed: (collapsed) => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      // localStorage 不可用時僅影響下次啟動的記憶，不影響操作
    }
    set({ sidebarCollapsed: collapsed })
  },
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  solveMaxTime: 30,
  solveEnableDBackup: true,
  setSolveMaxTime: (seconds) => set({ solveMaxTime: seconds }),
  setSolveEnableDBackup: (enabled) => set({ solveEnableDBackup: enabled }),
}))
