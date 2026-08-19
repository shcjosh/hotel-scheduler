import { useQuery } from '@tanstack/react-query'
import { useUIStore } from '../stores/uiStore'
import { getMonthStats } from '../api/stats'
import { getChangeLogs } from '../api/scheduleMeta'
import { ExportButtons } from '../components/stats/ExportButtons'
import { MonthSummaryCard } from '../components/stats/MonthSummaryCard'
import { EmployeeStatsTable } from '../components/stats/EmployeeStatsTable'
import { ShiftDistributionTable } from '../components/stats/ShiftDistributionTable'
import { DailyCoverageTable } from '../components/stats/DailyCoverageTable'
import { WeekendSummaryTable } from '../components/stats/WeekendSummaryTable'
import { SoftConstraintTable } from '../components/stats/SoftConstraintTable'
import { ChangeLogPanel } from '../components/stats/ChangeLogPanel'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  )
}

export function StatsPage() {
  const { currentYear, currentMonth } = useUIStore()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stats', currentYear, currentMonth],
    queryFn: () => getMonthStats(currentYear, currentMonth),
  })
  const { data: changeLogs = [] } = useQuery({
    queryKey: ['change-logs', currentYear, currentMonth],
    queryFn: () => getChangeLogs(currentYear, currentMonth),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">統計報表</h2>
          <p className="text-sm text-gray-500">{currentYear}年{currentMonth}月 排班統計</p>
        </div>
        <div className="flex items-center gap-2">
          <ChangeLogPanel logs={changeLogs} />
          <ExportButtons year={currentYear} month={currentMonth} />
        </div>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">載入中…</div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          載入失敗：{error instanceof Error ? error.message : '未知錯誤'}
        </div>
      )}

      {data && (
        <>
          <MonthSummaryCard stats={data} />

          <Section title="每人統計">
            <EmployeeStatsTable rows={data.per_employee} leaveTypes={data.leave_types ?? []} />
          </Section>

          <Section title="班次分佈">
            <ShiftDistributionTable perShift={data.per_shift} />
          </Section>

          <Section title="每日覆蓋">
            <DailyCoverageTable rows={data.daily_coverage} />
          </Section>

          <Section title="週末摘要">
            <WeekendSummaryTable weekend={data.weekend_summary} />
          </Section>

          <Section title="軟性約束達成">
            <SoftConstraintTable stats={data.soft_constraint_stats} />
          </Section>
        </>
      )}
    </div>
  )
}
