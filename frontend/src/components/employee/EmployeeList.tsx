import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { getShiftStyle } from '../../utils/shift'
import { ROLE_LABELS } from '../../utils/roles'
import { displayName } from '../../utils/employee'
import type { Employee } from '../../types'

interface EmployeeListProps {
  employees: Employee[]
  onEdit: (emp: Employee) => void
  onDelete: (emp: Employee) => void
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
}

export function EmployeeList({ employees, onEdit, onDelete, onMoveUp, onMoveDown }: EmployeeListProps) {
  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
        尚無員工，請點「新增員工」
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="w-16 px-3 py-2 text-center">順序</th>
            <th className="px-4 py-2 text-left">姓名</th>
            <th className="px-4 py-2 text-left">角色</th>
            <th className="px-4 py-2 text-left">可上班班次</th>
            <th className="px-4 py-2 text-left">偏好班次</th>
            <th className="px-4 py-2 text-left">排班方式</th>
            <th className="px-4 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, idx) => (
            <tr key={emp.id} className="border-t border-gray-100 hover:bg-indigo-50/40">
              <td className="px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onMoveUp?.(idx)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20"
                    title="上移"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === employees.length - 1}
                    onClick={() => onMoveDown?.(idx)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20"
                    title="下移"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td className="px-4 py-2 font-medium text-gray-800">{displayName(emp)}</td>
              <td className="px-4 py-2 text-gray-600">
                {ROLE_LABELS[emp.role]}
              </td>
              <td className="px-4 py-2">
                <div className="flex gap-1">
                  {emp.available_shifts.map((s) => {
                    const style = getShiftStyle(s)
                    return (
                      <span
                        key={s}
                        className={`inline-flex h-6 w-7 items-center justify-center rounded text-xs font-semibold ${style.bg} ${style.text}`}
                      >
                        {s}
                      </span>
                    )
                  })}
                </div>
              </td>
              <td className="px-4 py-2">
                {emp.preferred_shift ? (
                  (() => {
                    const style = getShiftStyle(emp.preferred_shift)
                    return (
                      <span
                        className={`inline-flex h-6 w-7 items-center justify-center rounded text-xs font-semibold ${style.bg} ${style.text}`}
                      >
                        {emp.preferred_shift}
                      </span>
                    )
                  })()
                ) : (
                  <span className="text-gray-400">無</span>
                )}
              </td>
              <td className="px-4 py-2 text-gray-600">
                {emp.scheduling_mode === 'auto' ? '自動' : '手動'}
              </td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => onEdit(emp)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                    title="編輯"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(emp)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                    title="刪除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
