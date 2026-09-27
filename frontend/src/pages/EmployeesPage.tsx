import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, ChevronDown, ChevronRight } from 'lucide-react'
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
    queryKey: ['employees', 'all'],
    queryFn: () => getEmployees(true),
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [showResigned, setShowResigned] = useState(false)

  const activeEmployees = employees.filter((e) => e.is_active === 1 && !e.resign_date)
  const resignedEmployees = employees.filter((e) => e.resign_date || e.is_active === 0)

  const createMut = useMutation({
    mutationFn: (payload: EmployeePayload) => createEmployee(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<EmployeePayload> }) =>
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
    if (
      !window.confirm(
        `確定要「刪除」${displayName(emp)} 嗎？\n\n刪除會永久移除，且僅限沒有任何班表/休假紀錄的員工。\n若要保留歷史班表，請改用「設離職」。`,
      )
    )
      return
    try {
      await deleteEmployee(emp.id)
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '刪除失敗')
    }
  }

  async function handleResign(emp: Employee) {
    const input = window.prompt(
      `設定「${displayName(emp)}」的最後上班日（YYYY-MM-DD）；留空 = 取消離職。\n離職月之後的班表將不再顯示此人。`,
      emp.resign_date ?? '',
    )
    if (input === null) return
    const value = input.trim()
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      window.alert('日期格式錯誤，請用 YYYY-MM-DD，例如 2026-09-30')
      return
    }
    try {
      await updateMut.mutateAsync({ id: emp.id, payload: { resign_date: value || null } })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '設定失敗')
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= activeEmployees.length) return
    const ids = activeEmployees.map((e) => e.id)
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
        <>
          <EmployeeList
            employees={activeEmployees}
            onEdit={openEdit}
            onDelete={handleDelete}
            onResign={handleResign}
            onMoveUp={(idx) => move(idx, -1)}
            onMoveDown={(idx) => move(idx, 1)}
          />

          {resignedEmployees.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowResigned((o) => !o)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                {showResigned ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                已離職 / 已停用員工
                <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                  {resignedEmployees.length}
                </span>
              </button>
              {showResigned && (
                <EmployeeList
                  employees={resignedEmployees}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onResign={handleResign}
                  reorderable={false}
                />
              )}
            </div>
          )}
        </>
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
