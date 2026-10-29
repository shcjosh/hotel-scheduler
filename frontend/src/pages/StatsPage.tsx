import { useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getMonthStats } from '../api/stats'
import { getChangeLogs } from '../api/scheduleMeta'
import { ExportButtons } from '../components/stats/ExportButtons'
import { DatabaseBackupSection } from '../components/stats/DatabaseBackupSection'
import { MonthSummaryCard } from '../components/stats/MonthSummaryCard'
import { EmployeeStatsTable } from '../components/stats/EmployeeStatsTable'
import { ShiftDistributionTable } from '../components/stats/ShiftDistributionTable'
import { DailyCoverageTable } from '../components/stats/DailyCoverageTable'
import { WeekendSummaryTable } from '../components/stats/WeekendSummaryTable'
import { SoftConstraintTable } from '../components/stats/SoftConstraintTable'
import { ChangeLogPanel } from '../components/stats/ChangeLogPanel'
import { AnnualLeaveSummaryTable } from '../components/stats/AnnualLeaveSummaryTable'
import { PageHeader } from '../components/ui/page-header'
import { Section } from '../components/ui/section'
import { LoadingState } from '../components/ui/loading-state'
import { EmptyState } from '../components/ui/empty-state'

export function StatsPage() {
  const { currentYear, currentMonth, solveMaxTime, setSolveMaxTime } = useUIStore()
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
      <PageHeader
        title="統計報表"
        description={`${currentYear}年${currentMonth}月 排班統計`}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              求解時間上限
              <input
                type="number"
                value={solveMaxTime}
                onChange={(e) => setSolveMaxTime(Number(e.target.value))}
                min={1}
                max={600}
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-slate-400">秒</span>
            </label>
            <ChangeLogPanel logs={changeLogs} />
            <ExportButtons year={currentYear} month={currentMonth} />
          </>
        }
      />

      {isLoading && <LoadingState label="載入統計資料…" />}
      {isError && (
        <EmptyState
          tone="danger"
          icon={CircleAlert}
          title="載入失敗"
          description={error instanceof Error ? error.message : '未知錯誤'}
        />
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

          <Section title="特休彙總（週年制）">
            <AnnualLeaveSummaryTable />
          </Section>

          <Section title="資料庫備份（整庫同步用）">
            <DatabaseBackupSection />
          </Section>
        </>
      )}
    </div>
  )
}
