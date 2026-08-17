import { apiClient } from './client'
import type { SolveResponse } from '../types'

export async function solveSchedule(
  year: number,
  month: number,
  maxSolveTime: number = 30,
): Promise<SolveResponse> {
  const { data } = await apiClient.post<SolveResponse>('/solve', {
    year,
    month,
    max_solve_time: maxSolveTime,
  })
  return data
}
