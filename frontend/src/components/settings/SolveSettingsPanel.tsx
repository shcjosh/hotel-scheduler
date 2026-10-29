import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { getSetting, updateSetting } from '../../api/settings'
import { useUIStore } from '../../stores/uiStore'
import { Section } from '../ui/section'
import { Field } from '../ui/field'
import { useToast } from '../../hooks/useToast'

/** 求解參數（/settings?tab=solve）。求解秒數/D 備援存前端，店長卡班上限存每月設定。 */
export function SolveSettingsPanel() {
  const {
    currentYear: year,
    currentMonth: month,
    solveMaxTime,
    setSolveMaxTime,
    solveEnableDBackup,
    setSolveEnableDBackup,
  } = useUIStore()
  const toast = useToast()
  const managerCapKey = `manager_backup_cap:${year}:${month}`

  const { data: managerCapSetting } = useQuery({
    queryKey: ['manager-cap', year, month],
    queryFn: () => getSetting(managerCapKey),
  })
  const [managerCap, setManagerCap] = useState('')

  useEffect(() => {
    if (managerCapSetting !== undefined) setManagerCap(managerCapSetting)
  }, [managerCapSetting])

  async function saveManagerCap() {
    const value = managerCap.trim()
    if (value === (managerCapSetting ?? '')) return
    try {
      await updateSetting(managerCapKey, value)
      toast(value ? `已設定店長每月最多卡班 ${value} 天` : '已取消店長卡班上限')
    } catch (error) {
      toast('儲存失敗', {
        tone: 'error',
        description: error instanceof Error ? error.message : '未知錯誤',
      })
    }
  }

  return (
    <div className="space-y-4">
      <Section title="求解參數" description="套用到下一次「開始排班」" contentPadded>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="求解時間上限（秒）"
            hint="越大越有機會找到較佳解，但排班等待時間也會變長（預設 30 秒）。"
          >
            <input
              type="number"
              min={1}
              max={600}
              value={solveMaxTime}
              onChange={(event) => setSolveMaxTime(Number(event.target.value))}
              className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="D 班備援邏輯" hint="備援日由 C+D 備援或管理職改排 D 班，系統自動找人遞補 C 班。">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={solveEnableDBackup}
                onChange={(event) => setSolveEnableDBackup(event.target.checked)}
                className="h-4 w-4"
              />
              啟用 D 班備援
            </label>
          </Field>
        </div>
      </Section>

      <Section
        title={`店長卡班上限（${year} 年 ${month} 月）`}
        description="每位管理職每月可被排 A/C 的天數上限；留空 = 不限制。超過上限的缺口會自動轉為支援請求。"
        contentPadded
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="最多卡班天數（A/C）" hint="此設定只套用目前選擇的月份。">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={managerCap}
                onChange={(event) => setManagerCap(event.target.value)}
                onBlur={saveManagerCap}
                placeholder="不限"
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-500">天</span>
            </div>
          </Field>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            求解時為硬性上限；臨時異動（局部重排）不套用此上限，避免已凍結的過去格位造成無解。
          </span>
        </div>
      </Section>
    </div>
  )
}
