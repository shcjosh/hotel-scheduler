import { Download } from 'lucide-react'
import { Button } from '../ui/button'

interface ExportButtonsProps {
  year: number
  month: number
}

export function ExportButtons({ year, month }: ExportButtonsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => window.open(`/api/v1/export/${year}/${month}/csv`, '_blank')}>
        <Download className="mr-2 h-4 w-4" /> 匯出 CSV
      </Button>
      <Button variant="outline" onClick={() => window.open(`/api/v1/export/${year}/${month}/json`, '_blank')}>
        <Download className="mr-2 h-4 w-4" /> 匯出 JSON
      </Button>
    </div>
  )
}
