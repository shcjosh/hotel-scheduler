import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, reorderEmployees } from '../api/employees'
import type { EmployeePayload } from '../api/employees'
import { updateRuleOverrides, type NightRuleState } from '../api/night'
import { EmployeeList } from '../components/employee/EmployeeList'
import { EmployeeForm } from '../components/employee/EmployeeForm'
import { Button } from '../components/ui/button'
import { displayName } from '../utils/employee'
import type { Employee } from '../types'

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const { data: employees = [], isLoading, isError, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)

  const createMut = useMutation({
    mutationFn: (payload: EmployeePayload) => createEmployee(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: EmployeePayload }) =>
      updateEmployee(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
  const reorderMut = useMutation({
    mutationFn: (ids: number[]) => reorderEmployees(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(emp: Employee) {
    setEditing(emp)
    setFormOpen(true)
  }
  async function handleSubmit(payload: EmployeePayload, nightRules: NightRuleState | null) {
    const emp = editing
      ? await updateMut.mutateAsync({ id: editing.id, payload })
      : await createMut.mutateAsync(payload)
    if (payload.role === 'night' && nightRules) {
      try {
        await updateRuleOverrides(emp.id, {
          rules: { H2: nightRules.H2, H3: nightRules.H3, H4: nightRules.H4, H12: nightRules.H12 },
        })
        await updateRuleOverrides(emp.id, { ignore_all: nightRules.ignore_all })
      } catch (e) {
        window.alert(
          `員工已儲存，但大夜規則開關儲存失敗：${e instanceof Error ? e.message : '未知錯誤'}\n請重新編輯該員工再調整規則開關。`,
        )
      }
    }
  }
  async function handleDelete(emp: Employee) {
    if (!window.confirm(`確定要刪除「${displayName(emp)}」嗎？（軟刪除）`)) return
    await deleteEmployee(emp.id)
    queryClient.invalidateQueries({ queryKey: ['employees'] })
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= employees.length) return
    const ids = employees.map((e) => e.id)
    const tmp = ids[index]
    ids[index] = ids[target]
    ids[target] = tmp
    await reorderMut.mutateAsync(ids)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">員工管理</h2>
          <p className="text-sm text-gray-500">管理員工資料、順序、角色與可用班次</p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="mr-2 h-4 w-4" />
          新增員工
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          載入中…
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          載入失敗：{error instanceof Error ? error.message : '未知錯誤'}
        </div>
      )}
      {!isLoading && !isError && (
        <EmployeeList
          employees={employees}
          onEdit={openEdit}
          onDelete={handleDelete}
          onMoveUp={(idx) => move(idx, -1)}
          onMoveDown={(idx) => move(idx, 1)}
        />
      )}

      <EmployeeForm
        open={formOpen}
        employee={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
