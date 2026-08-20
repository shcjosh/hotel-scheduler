import { apiClient } from './client'
import type { SolveResponse } from '../types'

export interface SolveCause {
  type: string
  severity: string
  message: string
  suggestion: string
  day?: number
}

export interface SolveDiagnostics {
  likely_causes: SolveCause[]
  constraint_analysis: Record<string, number>
}

export async function solveSchedule(
  year: number,
  month: number,
  maxSolveTime: number = 30,
  enableDBackup: boolean = true,
): Promise<SolveResponse & { diagnostics?: SolveDiagnostics }> {
  const { data } = await apiClient.post('/solve', {
    year,
    month,
    max_solve_time: maxSolveTime,
    enable_d_backup: enableDBackup,
  })
  return data
}
