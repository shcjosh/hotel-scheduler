import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSetting, updateSetting } from '../../api/settings'
import { Section } from '../ui/section'
import { Field, controlClassName } from '../ui/field'
import { useToast } from '../../hooks/useToast'

const DEFAULT_PRINT_NOTES = `需要連休三天以上，請提前2個月跟店長溝通。
＊請於當月會過後安排次月班表，櫃台五人上班時，平日可排休2人；周五、周六及週日限休1人。四人上班時，原則每日限休1人，並於25日前排定。
＊連續排班最多五日，不可超過。
＊如需調班(請於調班前提出)，並經主管核准。如遇突發狀況無法準時到班，請盡速主管以便調度。`

/** 列印設定（/settings?tab=print）。branch_name / print_notes 與 PDF 預覽共用同一組設定。 */
export function PrintSettingsPanel() {
  const toast = useToast()
  const { data: branchSetting } = useQuery({
    queryKey: ['setting', 'branch_name'],
    queryFn: () => getSetting('branch_name'),
  })
  const { data: notesSetting } = useQuery({
    queryKey: ['setting', 'print_notes'],
    queryFn: () => getSetting('print_notes'),
  })

  const [branch, setBranch] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (branchSetting !== undefined) setBranch(branchSetting)
  }, [branchSetting])
  useEffect(() => {
    if (notesSetting !== undefined) setNotes(notesSetting)
  }, [notesSetting])

  async function save(key: string, value: string, successMessage: string) {
    try {
      await updateSetting(key, value)
      toast(successMessage)
    } catch (error) {
      toast('儲存失敗', {
        tone: 'error',
        description: error instanceof Error ? error.message : '未知錯誤',
      })
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="列印抬頭"
        description="顯示在 PDF 第二行（例如：板橋府中店(一館)）；留空則只印飯店名稱。"
        contentPadded
      >
        <Field label="分館名稱">
          <input
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            onBlur={() => {
              if (branch !== (branchSetting ?? '')) save('branch_name', branch.trim(), '已儲存列印抬頭')
            }}
            placeholder="例：板橋府中店(一館)"
            className={controlClassName}
          />
        </Field>
      </Section>

      <Section
        title="頁尾注意事項"
        description="列印在 PDF 頁尾；也可以在列印預覽視窗直接修改（同一組設定）。"
        contentPadded
      >
        <Field
          label="注意事項"
          hint={`目前 ${notes.trim().length} 字；留空會使用系統預設文字。`}
        >
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== (notesSetting ?? '')) save('print_notes', notes, '已儲存頁尾注意事項')
            }}
            rows={6}
            placeholder={DEFAULT_PRINT_NOTES}
            className={controlClassName}
          />
        </Field>
      </Section>
    </div>
  )
}
