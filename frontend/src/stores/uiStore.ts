import { create } from 'zustand'

interface UIState {
  currentYear: number
  currentMonth: number
  setCurrentYear: (year: number) => void
  setCurrentMonth: (month: number) => void
}

const now = new Date()

export const useUIStore = create<UIState>((set) => ({
  currentYear: now.getFullYear(),
  currentMonth: now.getMonth() + 1,
  setCurrentYear: (year) => set({ currentYear: year }),
  setCurrentMonth: (month) => set({ currentMonth: month }),
}))
