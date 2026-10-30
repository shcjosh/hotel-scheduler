import { CalendarClock, LifeBuoy, PackageCheck, ShieldCheck } from 'lucide-react'
import type { Employee } from '../../types'
import type { ScheduleGroup } from '../../utils/brush'
import type { ValidationReport } from '../../api/schedules'
import type { SupportRequest } from '../../api/support'
import type { BackupRequestData } from '../../api/night'
import type { ScheduleSnapshot, SnapshotDiffChange } from '../../api/scheduleMeta'
import { Drawer } from '../ui/drawer'
import { cn } from '../../utils/cn'
import type { SidePanelTab } from './MonthStatusBar'
import { ValidationReportPanel } from './ValidationReport'
import { SupportRequestPanel } from '../support/SupportRequestPanel'
import { DBackupRequestPanel } from '../night/DBackupRequestPanel'
import { VersionHistoryPanel } from './VersionHistoryPanel'

interface ScheduleSidePanelProps {
  open: boolean
  tab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
  onClose: () => void
  group: ScheduleGroup
  employees: Employee[]
  counts: { hard: number; soft: number; openSupports: number }

  report: ValidationReport | undefined
  reportLoading: boolean
  onRefreshReport: () => void
  onJumpToCell: (empName: string, day: number) => void

  year: number
  month: number
  numDays: number
  supportRequests: SupportRequest[]
  onSupportAdd: (day: number, shift: string, reason: string) => Promise<unknown>
  onSupportUpdate: (id: number, status: string, resolution: string | null) => Promise<unknown>
  onSupportRemove: (id: number) => Promise<unknown>

  backupRequests: BackupRequestData[]
  onBackupAdd: (day: number) => Promise<unknown>
  onBackupRemove: (id: number) => Promise<unknown>

  snapshots: ScheduleSnapshot[]
  snapshotsLoading: boolean
  onRestoreSnapshot: (id: number) => Promise<void>
  onDiffSnapshots: (aId: number, bId: number) => Promise<{ changes: SnapshotDiffChange[] }>
  /** 手機唯讀：隱藏支援／大夜／版本還原等寫入操作。 */
  readOnly?: boolean
}

interface TabDef {
  value: SidePanelTab
  label: string
  icon: typeof ShieldCheck
  count?: number
  tone?: 'danger' | 'warning'
}

/** 右側抽屜：驗證／支援／大夜／版本。表格下方不再堆疊這些面板。 */
export function ScheduleSidePanel({
  open,
  tab,
  onTabChange,
  onClose,
  group,
  employees,
  counts,
  report,
  reportLoading,
  onRefreshReport,
  onJumpToCell,
  year,
  month,
  numDays,
  supportRequests,
  onSupportAdd,
  onSupportUpdate,
  onSupportRemove,
  backupRequests,
  onBackupAdd,
  onBackupRemove,
  snapshots,
  snapshotsLoading,
  onRestoreSnapshot,
  onDiffSnapshots,
  readOnly = false,
}: ScheduleSidePanelProps) {
  const isFront = group === 'front'

  const tabs: TabDef[] = isFront
    ? [
        {
          value: 'validation',
          label: '驗證',
          icon: ShieldCheck,
          count: counts.hard,
          tone: 'danger',
        },
        {
          value: 'support',
          label: '支援',
          icon: LifeBuoy,
          count: counts.openSupports,
          tone: 'warning',
        },
        { value: 'night', label: '大夜', icon: CalendarClock },
        { value: 'version', label: '版本', icon: PackageCheck },
      ]
    : [{ value: 'version', label: '版本', icon: PackageCheck }]

  const activeTab = tabs.some((item) => item.value === tab) ? tab : tabs[0].value

  return (
    <Drawer
      open={open}
      title={isFront ? '班表檢查與版本' : '版本紀錄'}
      description={`${year} 年 ${month} 月`}
      onClose={onClose}
      widthClassName="max-w-2xl"
    >
      <div role="tablist" aria-label="班表面板" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.value
          const showCount = item.count !== undefined && item.count > 0
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(item.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {showCount && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold',
                    item.tone === 'danger'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'validation' && (
        <ValidationReportPanel
          report={report}
          isLoading={reportLoading}
          onRefresh={onRefreshReport}
          onJumpTo={onJumpToCell}
          employees={employees}
        />
      )}

      {activeTab === 'support' && (
        <SupportRequestPanel
          requests={supportRequests}
          numDays={numDays}
          month={month}
          onAdd={onSupportAdd}
          onUpdate={onSupportUpdate}
          onRemove={onSupportRemove}
          readOnly={readOnly}
        />
      )}

      {activeTab === 'night' && isFront && (
        <DBackupRequestPanel
          year={year}
          month={month}
          numDays={numDays}
          requests={backupRequests}
          onAdd={onBackupAdd}
          onRemove={onBackupRemove}
          readOnly={readOnly}
        />
      )}

      {activeTab === 'version' && (
        <VersionHistoryPanel
          snapshots={snapshots}
          isLoading={snapshotsLoading}
          employees={employees}
          onRestore={onRestoreSnapshot}
          onDiff={onDiffSnapshots}
          readOnly={readOnly}
        />
      )}
    </Drawer>
  )
}
