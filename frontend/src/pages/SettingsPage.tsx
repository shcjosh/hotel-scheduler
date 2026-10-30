import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/ui/page-header'
import { Tabs } from '../components/ui/tabs'
import { LoadingState } from '../components/ui/loading-state'
import { LeaveTypesPanel } from '../components/settings/LeaveTypesPanel'
import { CrossMonthPanel } from '../components/settings/CrossMonthPanel'
import { SolveSettingsPanel } from '../components/settings/SolveSettingsPanel'
import { PrintSettingsPanel } from '../components/settings/PrintSettingsPanel'
import { useUIStore } from '../stores/uiStore'
import {
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
} from '../api/leaveTypes'

const TABS = [
  { value: 'leave-types', label: '假別管理' },
  { value: 'cross-month', label: '跨月銜接' },
  { value: 'solve', label: '求解參數' },
  { value: 'print', label: '列印設定' },
] as const

type SettingsTab = (typeof TABS)[number]['value']

function isSettingsTab(value: string | null): value is SettingsTab {
  return TABS.some((tab) => tab.value === value)
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: SettingsTab = isSettingsTab(tabParam) ? tabParam : 'leave-types'
  const { currentYear: year, currentMonth: month } = useUIStore()
  const queryClient = useQueryClient()

  const { data: leaveTypes = [], isLoading: leaveTypesLoading } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => getLeaveTypes(),
  })

  function invalidateLeaveTypes() {
    queryClient.invalidateQueries({ queryKey: ['leave-types'] })
    queryClient.invalidateQueries({ queryKey: ['off-days', year, month] })
    queryClient.invalidateQueries({ queryKey: ['schedule', year, month] })
    queryClient.invalidateQueries({ queryKey: ['housekeeping-schedule', year, month] })
  }

  const createMut = useMutation({
    mutationFn: ({ name, bg, text }: { name: string; bg: string; text: string }) =>
      createLeaveType(name, bg, text),
    onSuccess: invalidateLeaveTypes,
  })
  const updateMut = useMutation({
    mutationFn: ({
      code,
      payload,
    }: {
      code: string
      payload: { name?: string; color_bg?: string; color_text?: string }
    }) => updateLeaveType(code, payload),
    onSuccess: invalidateLeaveTypes,
  })
  const deleteMut = useMutation({
    mutationFn: (code: string) => deleteLeaveType(code),
    onSuccess: invalidateLeaveTypes,
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="排班規則"
        description="假別、跨月銜接、求解參數與列印設定；排班相關的設定都集中在這裡"
      />

      <Tabs
        ariaLabel="排班規則分類"
        items={TABS}
        value={tab}
        onChange={(next) => setSearchParams({ tab: next }, { replace: true })}
      />

      {tab === 'leave-types' &&
        (leaveTypesLoading ? (
          <LoadingState label="載入假別…" />
        ) : (
          <LeaveTypesPanel
            leaveTypes={leaveTypes}
            onCreate={(name, bg, text) => createMut.mutateAsync({ name, bg, text }).then(() => undefined)}
            onUpdate={(code, payload) => updateMut.mutateAsync({ code, payload }).then(() => undefined)}
            onDelete={(code) => deleteMut.mutateAsync(code).then(() => undefined)}
          />
        ))}

      {tab === 'cross-month' && <CrossMonthPanel />}
      {tab === 'solve' && <SolveSettingsPanel />}
      {tab === 'print' && <PrintSettingsPanel />}
    </div>
  )
}
