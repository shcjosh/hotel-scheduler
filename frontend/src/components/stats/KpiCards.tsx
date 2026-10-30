import { CalendarCheck2, ShieldCheck, TriangleAlert, Users } from 'lucide-react'
import type { MonthStats } from '../../api/stats'
import type { ValidationReport } from '../../api/schedules'
import { Card } from '../ui/card'
import { cn } from '../../utils/cn'

interface KpiCardsProps {
  stats: MonthStats
  report?: ValidationReport
}

function averageWeekendWorkers(stats: MonthStats): string {
  const { saturdays, sundays } = stats.weekend_summary
  const days = saturdays.length + sundays.length
  if (days === 0) return '—'
  const workers =
    saturdays.reduce((sum, day) => sum + day.workers.length, 0) +
    sundays.reduce((sum, day) => sum + day.workers.length, 0)
  return (workers / days).toFixed(1)
}

/** 統計頁最上方的 4 張 KPI 卡。 */
export function KpiCards({ stats, report }: KpiCardsProps) {
  const employees = stats.per_employee
  const avgWorkDays =
    employees.length > 0
      ? (employees.reduce((sum, row) => sum + row.total_work_days, 0) / employees.length).toFixed(1)
      : '—'

  const hard = report?.summary.hard_violations ?? stats.violations_summary.hard_violations
  const soft = report?.summary.soft_warnings ?? stats.violations_summary.soft_warnings
  const clean = hard === 0

  const cards = [
    {
      label: '總班次',
      value: stats.month_summary.total_shifts,
      hint: `${stats.month_summary.num_days} 天`,
      icon: CalendarCheck2,
      tone: 'text-brand-600 bg-brand-50',
    },
    {
      label: '每人平均上班天數',
      value: avgWorkDays,
      hint: `${employees.length} 位員工`,
      icon: Users,
      tone: 'text-blue-600 bg-blue-50',
    },
    {
      label: '週末平均上班人數',
      value: averageWeekendWorkers(stats),
      hint: '週六＋週日',
      icon: CalendarCheck2,
      tone: 'text-teal-600 bg-teal-50',
    },
    {
      label: '違規／警告',
      value: `${hard}／${soft}`,
      hint: clean ? '硬性規則全部通過' : '有硬性違規，請看班表驗證',
      icon: clean ? ShieldCheck : TriangleAlert,
      tone: clean ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.label} padded className="flex items-start gap-3">
            <span className={cn('rounded-md p-2', card.tone)}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{card.label}</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-800">{card.value}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">{card.hint}</div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
