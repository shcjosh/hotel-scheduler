import { apiClient } from './client'
import type { Employee, EmployeeRole, SchedulingMode } from '../types'

export interface EmployeePayload {
  name: string
  nickname?: string | null
  tag?: string | null
  sort_order?: number
  role: EmployeeRole
  available_shifts: string[]
  preferred_shift: string | null
  scheduling_mode: SchedulingMode
}

export async function getEmployees(includeInactive = false): Promise<Employee[]> {
  const { data } = await apiClient.get<Employee[]>('/employees', {
    params: includeInactive ? { include_inactive: true } : undefined,
  })
  return data
}

export async function reorderEmployees(employeeIds: number[]): Promise<Employee[]> {
  const { data } = await apiClient.post<Employee[]>('/employees/reorder', employeeIds)
  return data
}

export async function getEmployee(id: number): Promise<Employee> {
  const { data } = await apiClient.get<Employee>(`/employees/${id}`)
  return data
}

export async function createEmployee(payload: EmployeePayload): Promise<Employee> {
  const { data } = await apiClient.post<Employee>('/employees', payload)
  return data
}

export async function updateEmployee(
  id: number,
  payload: Partial<EmployeePayload>,
): Promise<Employee> {
  const { data } = await apiClient.put<Employee>(`/employees/${id}`, payload)
  return data
}

export async function deleteEmployee(id: number): Promise<void> {
  await apiClient.delete(`/employees/${id}`)
}
