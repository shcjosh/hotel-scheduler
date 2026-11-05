import { Smartphone } from 'lucide-react'

/** 手機（< 768px）唯讀提示；桌機不顯示。 */
export function MobileReadOnlyBanner() {
  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 md:hidden">
      <Smartphone className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        手機版為唯讀檢視；修改班表、休假、員工或設定請使用桌機（視窗寬度 ≥ 768px）。
        列印／匯出仍可使用。
      </span>
    </div>
  )
}
