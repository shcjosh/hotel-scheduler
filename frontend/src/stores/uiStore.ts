import { create } from 'zustand'

interface UIState {
  currentYear: number
  currentMonth: number
  setCurrentYear: (year: number) => void
  setCurrentMonth: (month: number) => void
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
  solveMaxTime: 30,
  solveEnableDBackup: true,
  setSolveMaxTime: (seconds) => set({ solveMaxTime: seconds }),
  setSolveEnableDBackup: (enabled) => set({ solveEnableDBackup: enabled }),
}))
