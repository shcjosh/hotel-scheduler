import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, CheckCircle2, AlertOctagon, ArrowRight } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { solveSchedule, type SolveDiagnostics } from '../api/solve'
import { getScheduleStatus } from '../api/scheduleMeta'
import { useQuery } from '@tanstack/react-query'
import type { SolveResponse } from '../types'
import { Button } from '../components/ui/button'
import { cn } from '../utils/cn'

const SOFT_LABELS: Record<string, string> = {
  s1_5consecutive_count: 'S1 連續5天',
  s2_b_to_a_count: 'S2 B→A',
  s3_c_to_b_count: 'S3 C→B',
  s5_preferred_satisfied: 'S5 偏好滿足',
  s6_work_days_spread: 'S6 上班天數差',
  s7_non_backup_d_count: 'S7 非備援D',
  s8_manager_backup_count: 'S8 管理職備援',
  s9_off_block_count: 'S9 連休次數',
}

function empStats(row: string[]) {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, OFF: 0, SPECIAL: 0 }
  for (const s of row) counts[s] = (counts[s] ?? 0) + 1
  return counts
}

export function SolvePage() {
  const { currentYear, currentMonth } = useUIStore()
  const navigate = useNavigate()
  const [maxTime, setMaxTime] = useState(30)
  const [enableDBackup, setEnableDBackup] = useState(true)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<SolveResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: statusData } = useQuery({
    queryKey: ['schedule-status', currentYear, currentMonth],
    queryFn: () => getScheduleStatus(currentYear, currentMonth),
  })

  async function handleSolve() {
    if (
      statusData?.status === 'published' &&
      !window.confirm('目前班表已發布，重新排班將覆蓋現有班表，確定要繼續嗎？')
    ) {
      return
    }
    setSolving(true)
    setError(null)
    setResult(null)
    try {
      const r = await solveSchedule(currentYear, currentMonth, maxTime, enableDBackup)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : '求解失敗')
    } finally {
      setSolving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">一鍵排班</h2>
        <p className="text-sm text-gray-500">{currentYear}年{currentMonth}月 — CP-SAT 求解引擎</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">求解時間上限（秒）</label>
            <input
              type="number"
              value={maxTime}
              onChange={(e) => setMaxTime(Number(e.target.value))}
              min={1}
              max={600}
              className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={enableDBackup}
              onChange={(e) => setEnableDBackup(e.target.checked)}
              className="h-4 w-4"
            />
            啟用 D 班備援邏輯
          </label>
          <Button onClick={handleSolve} disabled={solving}>
            {solving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {solving ? '排班中…' : '開始排班'}
          </Button>
        </div>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>

      {result?.success && result.schedule && (
        <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-green-700">
            <CheckCircle2 className="h-5 w-5" /> 排班成功
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <span>求解時間：{result.solve_time} 秒</span>
            <span>目標函數值：{result.objective_value}</span>
          </div>
          {result.support_requests && result.support_requests.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1 text-sm font-semibold text-amber-700">
                已自動請求外部支援 {result.support_requests.length} 筆（需安排人力）
              </div>
              <ul className="space-y-1 text-xs text-amber-700">
                {result.support_requests.map((r) => (
                  <li key={r.id}>
                    {r.day === 0 ? '全月' : `${currentMonth}/${r.day}`} {r.shift} 班
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.soft_constraint_stats && (
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(result.soft_constraint_stats).map(([k, v]) => (
                <span key={k} className="rounded bg-white px-2 py-1 text-gray-600">
                  {SOFT_LABELS[k] ?? k}：{v}
                </span>
              ))}
            </div>
          )}
          <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">員工</th>
                  {['A', 'B', 'C', 'D', '休', '特休', '總上班'].map((h) => (
                    <th key={h} className="px-3 py-2 text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.schedule).map(([name, row]) => {
                  const c = empStats(row)
                  const work = c.A + c.B + c.C + c.D
                  return (
                    <tr key={name} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-800">{name}</td>
                      <td className="px-3 py-1.5 text-right">{c.A}</td>
                      <td className="px-3 py-1.5 text-right">{c.B}</td>
                      <td className="px-3 py-1.5 text-right">{c.C}</td>
                      <td className="px-3 py-1.5 text-right">{c.D}</td>
                      <td className="px-3 py-1.5 text-right">{c.OFF}</td>
                      <td className="px-3 py-1.5 text-right">{c.SPECIAL}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{work}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Button onClick={() => navigate('/')}>
            查看完整班表 <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {result && !result.success && (
        <SolveFailure result={result} onRetry={handleSolve} month={currentMonth} />
      )}
    </div>
  )
}

function SolveFailure({ result, onRetry, month }: { result: SolveResponse; onRetry: () => void; month: number }) {
  const diag = result.diagnostics as SolveDiagnostics | null
  const supportReqs = result.support_requests ?? []
  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 font-semibold text-red-700">
        <AlertOctagon className="h-5 w-5" /> 排班失敗：無法找到合法解
      </div>
      {diag?.likely_causes?.map((c, i) => (
        <div key={i} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={cn(
              'rounded px-1.5 py-0.5 text-xs font-semibold',
              c.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
            )}>
              {c.severity === 'critical' ? '嚴重' : '注意'}
            </span>
            <span className="font-medium text-gray-800">{c.message}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">建議：{c.suggestion}</div>
        </div>
      ))}
      {supportReqs.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
          <div className="mb-1 text-sm font-semibold text-orange-700">
            需要支援的人力（{supportReqs.length} 筆）
          </div>
          <ul className="space-y-1 text-xs text-orange-700">
            {supportReqs.map((r) => (
              <li key={r.id}>
                {r.day === 0 ? '全月' : `${month}/${r.day}`} {r.shift} 班缺人{r.reason ? ` — ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {diag?.constraint_analysis && (
        <div className="text-xs text-gray-500">
          員工數：{diag.constraint_analysis.employee_count}（非大夜 {diag.constraint_analysis.non_night_count}，A可上 {diag.constraint_analysis.a_capable}，C可上 {diag.constraint_analysis.c_capable}）
        </div>
      )}
      <Button variant="outline" onClick={onRetry}>重新排班</Button>
    </div>
  )
}
