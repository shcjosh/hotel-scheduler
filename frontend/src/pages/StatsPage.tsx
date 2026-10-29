import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, Settings2 } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getMonthStats } from '../api/stats'
import { getChangeLogs } from '../api/scheduleMeta'
import { getValidationReport } from '../api/schedules'
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
import { KpiCards } from '../components/stats/KpiCards'
import { PageHeader } from '../components/ui/page-header'
import { Button } from '../components/ui/button'
import { Section } from '../components/ui/section'
import { Tabs } from '../components/ui/tabs'
import { LoadingState } from '../components/ui/loading-state'
import { EmptyState } from '../components/ui/empty-state'

const TABS = [
  { value: 'overview', label: '總覽' },
  { value: 'employees', label: '每人統計' },
  { value: 'coverage', label: '每日覆蓋' },
  { value: 'fairness', label: '公平性與軟性約束' },
  { value: 'leave', label: '休假與特休' },
  { value: 'changes', label: '變更紀錄' },
  { value: 'backup', label: '備份' },
] as const

type StatsTab = (typeof TABS)[number]['value']

export function StatsPage() {
  const { currentYear, currentMonth } = useUIStore()
  const [tab, setTab] = useState<StatsTab>('overview')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stats', currentYear, currentMonth],
    queryFn: () => getMonthStats(currentYear, currentMonth),
  })
  const { data: changeLogs = [] } = useQuery({
    queryKey: ['change-logs', currentYear, currentMonth],
    queryFn: () => getChangeLogs(currentYear, currentMonth),
  })
  const { data: report } = useQuery({
    queryKey: ['validation', currentYear, currentMonth],
    queryFn: () => getValidationReport(currentYear, currentMonth),
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="統計報表"
        description={`${currentYear} 年 ${currentMonth} 月 排班統計；求解參數請到「排班規則」調整`}
        actions={
          <>
            <Link to="/settings?tab=solve">
              <Button variant="ghost">
                <Settings2 className="mr-2 h-4 w-4" /> 求解參數
              </Button>
            </Link>
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
          <KpiCards stats={data} report={report} />

          <Tabs
            ariaLabel="統計分類"
            items={TABS}
            value={tab}
            onChange={(next) => setTab(next)}
          />

          {tab === 'overview' && (
            <div className="space-y-4">
              <Section title="本月摘要" description="求解狀態、目標函數與求解時間">
                <MonthSummaryCard stats={data} />
              </Section>
              <Section title="班次分佈" description="各班的總數、日均與最少/最多">
                <ShiftDistributionTable perShift={data.per_shift} />
              </Section>
            </div>
          )}

          {tab === 'employees' && (
            <Section title="每人統計" description="班次、休假、連休與偏好滿足度">
              <EmployeeStatsTable rows={data.per_employee} leaveTypes={data.leave_types ?? []} />
            </Section>
          )}

          {tab === 'coverage' && (
            <div className="space-y-4">
              <Section title="每日覆蓋" description="每日 A/B/C/D/M 人數">
                <DailyCoverageTable rows={data.daily_coverage} />
              </Section>
              <Section title="週末摘要" description="週六／週日上班名單">
                <WeekendSummaryTable weekend={data.weekend_summary} />
              </Section>
            </div>
          )}

          {tab === 'fairness' && (
            <Section title="軟性約束達成" description="S1~S3、S5~S10 的統計值">
              <SoftConstraintTable stats={data.soft_constraint_stats} />
            </Section>
          )}

          {tab === 'leave' && (
            <Section title="特休彙總（週年制）" description="各期間額度、已用與剩餘">
              <AnnualLeaveSummaryTable />
            </Section>
          )}

          {tab === 'changes' && (
            <Section title="變更紀錄" description="已發布班表的格位調整">
              <ChangeLogPanel logs={changeLogs} inline />
            </Section>
          )}

          {tab === 'backup' && (
            <Section title="資料庫備份（整庫同步用）" description="下載目前資料庫或匯入其他裝置的資料庫">
              <DatabaseBackupSection />
            </Section>
          )}
        </>
      )}
    </div>
  )
}
