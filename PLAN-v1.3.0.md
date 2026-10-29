# v1.3.0 UI/UX 重整計畫書

> 建立日期：2026-10-29
> 前置版本：`v1.2.3`（PDF 列印改版已完成）
> 目標版本：`v1.3.0-beta` → `v1.3.0` 正式版
> 本計畫只處理前端資訊架構與操作體驗；**不动排班求解器、約束規則、班表資料格式**。

---

## 1. 目標

1. 把「一個月的工作流程」整合成同一組工作區：
   設休假 → 產生班表 → 微調 → 驗證 → 發布 → 列印/匯出。
2. 消除 `排班表` 與 `房務班表` 兩頁幾乎重複的程式與不一致的操作。
3. 建立一致的頁首、工具列、卡片、抽屜、空狀態、錯誤/載入狀態與設計 token。
4. 降低排班表頁面的視覺噪音：主要動作只有一個，其餘收進選單或右側抽屜。
5. 提升日常微調速度：畫筆、拖曳、鍵盤、undo/redo、批次暫存。
6. 保留既有 PDF 預覽與列印能力，不改 1.2.3 已驗證的輸出邏輯。

## 2. 非目標（Out of Scope）

- 不改 `backend/app/scheduler/`（engine、constraints、data_loader）。
- 不改 H1~H14、S1~S10、店長卡班上限、跨月求解邏輯。
- 不改 SQLite schema；若真的需要新欄位，必須先獨立討論與 migration。
- 不改 PDF 的休假線條/主管班規則（1.2.3 已完成）。
- 不做多館權限、登入、雲端部署（見 ROADMAP 其他章節）。
- 不追求手機完整編輯；手機以唯讀檢視為目標。

---

## 3. 現況問題（以 1.2.3 程式為準）

| 問題 | 具體位置 | 影響 |
|---|---|---|
| 6 個平鋪導覽，沒有工作流分組 | `components/layout/Sidebar.tsx` | 使用者不知道「這個月下一步要做什麼」 |
| 排班表頁面過長、動作過多 | `pages/SchedulePage.tsx`（600+ 行） | 8 個右上角按鈕＋2 條工具列；清空/鎖定與發布並排 |
| 房務頁重複實作 | `pages/HousekeepingPage.tsx` | 畫筆、暫存、狀態、清空邏輯與排班表重複；行為不一致 |
| 休假頁混合多種工作 | `pages/OffDaysPage.tsx`（400+ 行） | 指定休假、假別管理、求解參數、結果、特休、統計表全在同一頁 |
| 統計頁一路往下堆 | `pages/StatsPage.tsx` | 8 個 section 沒有層級，重要指標被淹沒 |
| 沒有共用 UI 元件 | `components/ui/` 只有 `button.tsx`、`modal.tsx` | 每頁手寫卡片/空狀態/載入/表格，視覺不一致 |
| 狀態提示用 emoji | `STATUS_META` 的 🟡🟢🔒 | 不同平台顯示不一致，也不易做無障礙 |
| Header 只有月份選擇 | `components/layout/Header.tsx` | 沒有「本月狀態、違規數、待處理」的全域提示 |
| 破壞性動作太顯眼 | Schedule/HK 頁 | 清空班表與主要動作同等視覺權重，誤按風險高 |
| 排班表下方面板太長 | SchedulePage | 驗證、支援、大夜、版本全部堆在表格下方，需大量捲動 |

---

## 4. 目標資訊架構

### 4.1 側欄分組

```
本月作業
  班表                 ← 櫃台 / 房務 分頁（合併兩頁）
  休假與排班           ← 指定休假 + 請假 + 產生班表
資料設定
  員工管理
  排班規則             ← 假別、跨月、求解參數、列印設定
分析與輸出
  統計報表
  版本紀錄             ← 從班表右側抽屜開啟，不占主選單
  PDF / CSV            ← 從頁首或工具列開啟
```

- 側欄可收合（64px icon mode），手機為 drawer。
- 每個項目可顯示 badge：
  - 班表：`草稿` / `已發布` / `鎖定`
  - 驗證：違規數（例如 `3`）
  - 休假與排班：未設定休假數（若可計算）
- 版本紀錄不新增主路由，維持 drawer。

### 4.2 路由

| 路由 | 頁面 | 說明 |
|---|---|---|
| `/` | `SchedulePage` | 班表（預設櫃台）；`?group=housekeeping` 切房務 |
| `/housekeeping` | redirect | 轉到 `/?group=housekeeping`，保留舊書籤 |
| `/off-days` | `OffDaysPage` | 休假與排班 |
| `/employees` | `EmployeesPage` | 員工管理 |
| `/settings` | `SettingsPage`（新） | 假別、跨月、求解參數、列印設定 |
| `/cross-month` | redirect | 轉到 `/settings?tab=cross-month` |
| `/stats` | `StatsPage` | 統計報表 |
| `/print` | （選用） | 若 modal 在 1.3.0 變得太複雜，再抽成獨立預覽頁 |

- 所有 redirect 用 `<Navigate replace />`，避免歷史紀錄堆疊。
- 不在 1.3.0 新增「本月總覽」獨立首頁；先以班表頁上方的**本月狀態列**取代，避免多一次點擊。

### 4.3 Header

- 左：目前頁面標題（由 route 決定，不再由各頁自行重複）。
- 中：月份導覽
  - `‹ 2026 年 10 月 ›`
  - `本月` 按鈕
  - 狀態 pill（草稿/已發布/鎖定）
- 右：使用者選單
  - 顯示 `Josh Wang`
  - 編輯飯店名稱／分館名稱
  - 「關閉系統」收進選單，不再裸露電源 icon
- `PageHeader` 只負責頁面層級的標題、副標、主要動作；Header 不再重複標題。

---

## 5. 設計系統

### 5.1 Token

在 `tailwind.config` / `styles/globals.css` 定義：

- 品牌色：indigo（沿用現有）
- 中性色：slate/gray
- 狀態色：success / warning / danger / info
- 圓角：`sm=6px`、`md=8px`、`lg=12px`
- 陰影：`card`、`popover`、`drawer`
- 字級：`xs=12`、`sm=13`、`base=14`、`lg=16`、`xl=20`
- 間距以 4px 為基準
- 表格密度：`comfortable` / `compact`

### 5.2 共用元件（新增）

| 元件 | 用途 |
|---|---|
| `PageHeader` | 頁面標題、副標、主要動作、次要動作 overflow |
| `Card` / `Section` | 一致的卡片與區塊標題 |
| `Toolbar` | 水平工具列，可 sticky |
| `Tabs` | 頁內分頁（櫃台/房務、統計分頁、設定分頁） |
| `StatusPill` | 草稿/已發布/鎖定，lucide icon + 文字 |
| `Badge` | 數量、角色、離職、二館等標籤 |
| `EmptyState` | 圖示＋說明＋CTA |
| `LoadingState` / `Skeleton` | 頁面/表格載入 |
| `Drawer` | 右側面板（驗證、支援、大夜、版本、員工編輯） |
| `ConfirmDialog` | 清空、鎖定、覆蓋等破坏性操作 |
| `Toast` | 儲存成功/失敗、批次套用結果 |
| `DataTable` | sticky header、compact、排序（若需要） |
| `Field` | label + hint + error 的表單欄位 |

- 把 emoji 狀態改為 lucide icon + 文字。
- Modal/Drawer 加 focus trap、Esc 關閉、`aria-modal`、`aria-labelledby`。
- 所有 destructive 動作使用 `ConfirmDialog`，不再用 `window.confirm`。

---

## 6. 頁面重整

### 6.1 班表頁（`/`）

#### 版面

```
┌ PageHeader：2026 年 10 月班表        [發布] [⋯] ┐
│ 本月狀態列：草稿｜違規 3｜支援 2｜版本 v4        │
├ Tabs：櫃台 | 房務        [畫筆▾] [密度] [全螢幕] ┤
├───────────────────────────────────────────────┤
│ ScheduleGrid                                   │
│  姓名/日期 sticky、週框線、週末、今天、hover    │
│  點格：popover 選班別；拖曳：連續塗色           │
├───────────────────────────────────────────────┤
│ 已暫存 12 處｜放棄｜檢查並套用                  │
└───────────────────────────────────────────────┘
右側 Drawer：驗證 3｜支援 2｜大夜｜版本
```

#### 元件拆分

- `pages/SchedulePage.tsx`：只負責資料查詢、頁面組合。
- `components/schedule/MonthStatusBar.tsx`
- `components/schedule/ScheduleToolbar.tsx`
- `components/schedule/ScheduleGrid.tsx`（由 `ScheduleTable` 進化）
- `components/schedule/PendingChangesBar.tsx`
- `components/schedule/ScheduleSidePanel.tsx`（Drawer + tabs）
- `components/schedule/ScheduleActionsMenu.tsx`
- `components/schedule/CellEditorPopover.tsx`
- `hooks/useScheduleBrush.ts`（櫃台/房務共用）
- `hooks/usePendingChanges.ts`
- `hooks/useGridSelection.ts`

#### 行為規則

- `group=front`：
  - 沿用現有驗證、H1~H14、支援、大夜、版本。
  - 格位限制與 `available_shifts` 不變。
- `group=housekeeping`：
  - 只允許 A / OFF / 假別。
  - 不做規則檢測、不顯示覆蓋列/支援/大夜。
  - 仍共用月狀態、版本、PDF 預覽。
- 主要動作依狀態切換：
  - 草稿：`發布班表`
  - 已發布：`列印 / PDF`（或 `下載`）
  - 鎖定：`解鎖`（次要）
- `⋯` 選單：
  - 版本歷史
  - 臨時異動
  - 清空當月（confirm）
  - 清空大夜（confirm，僅 front）
  - 鎖定/解鎖
- 畫筆：
  - 收進 popover，不再一整排。
  - 顯示目前畫筆與「取消」。
  - 支援 undo/redo（前端暫存層）。
- 鍵盤：
  - 方向鍵移動選取、Enter 編輯、Esc 取消。
  - Shift + 方向鍵範圍選取。
- 表格：
  - 表頭與姓名欄黏著。
  - 週一粗線、週末淺底、今天加圈。
  - 滑鼠 hover 整列/整欄高亮。
  - 支援全螢幕/密度切換。

### 6.2 休假與排班（`/off-days`）

- 兩欄：
  - 左：員工清單（頭像、姓名、本月休假日數、連休狀態）。
  - 右：月曆（指定休假/請假）。
- 上方 toolbar：
  - 模式：指定休假 / 特休 / 事假 / 病假 / 自訂假別。
  - 主要動作：`開始排班`。
  - 進階：求解秒數、D 備援、店長卡班上限（popover）。
- 求解結果：
  - 成功：Toast + 結果摘要抽屜。
  - 失敗：診斷 drawer（likely causes + 建議）。
- 特休紀錄：
  - 放在頁內 tab 或 drawer，不與月曆搶版面。
- 假別管理：
  - 移到 `/settings?tab=leave-types`，休假頁只留「管理假別」連結。

### 6.3 員工管理（`/employees`）

- 上方：搜尋、角色 filter、`新增員工`。
- 在職 / 已離職分區（維持現有邏輯）。
- 編輯改為 Drawer（或保留 Modal，但統一 Field 樣式）。
- 大夜規則開關放在 Drawer 的「進階」區。
- 排序維持上移/下移；可加 drag handle（若時間允許）。

### 6.4 排班規則（`/settings`，新）

Tabs：

1. **假別管理**：從 OffDaysPage 移入。
2. **跨月銜接**：從 `/cross-month` 移入。
3. **求解參數**：求解秒數、D 備援預設、店長卡班上限預設。
4. **列印設定**：`branch_name`、`print_notes`（保留 PDF 預覽內也可編輯）。

- `/cross-month` redirect 到此頁 `?tab=cross-month`。
- 若某個 tab 的資料量太大，可先保留原頁面，仅改導覽分組；列為 Phase 3 可選。

### 6.5 統計報表（`/stats`）

- 上方 4 張 KPI 卡：
  - 總班次
  - 每人平均上班天數
  - 週末覆蓋
  - 違規/警告數
- Tabs：
  - 總覽
  - 每人統計
  - 每日覆蓋
  - 公平性/軟性約束
  - 休假/特休
  - 變更紀錄
  - 備份
- 匯出按鈕放 PageHeader；求解秒數移到 `/settings`。
- 表格使用 `DataTable`，sticky header、compact。

### 6.6 PDF/列印

- 保留 `PrintPreviewModal` 與 `utils/printSchedule.ts`、`utils/offDayMarks.ts`。
- 1.3.0 只做整合：
  - 從新工具列開啟。
  - 若 modal 太大，再抽 `/print` 頁。
- 不改斜線/交叉、主管班留白、節日列、頁尾規則。
- 列印設定的 `branch_name` / `print_notes` 可在 `/settings?tab=print` 與預覽兩處編輯（同一設定 key）。

---

## 7. 檔案層級實作對照

### 新增

```
frontend/src/components/ui/
  page-header.tsx
  card.tsx
  section.tsx
  toolbar.tsx
  tabs.tsx
  status-pill.tsx
  badge.tsx
  empty-state.tsx
  loading-state.tsx
  drawer.tsx
  confirm-dialog.tsx
  toast.tsx
  data-table.tsx
  field.tsx

frontend/src/components/schedule/
  MonthStatusBar.tsx
  ScheduleToolbar.tsx
  ScheduleGrid.tsx
  PendingChangesBar.tsx
  ScheduleSidePanel.tsx
  ScheduleActionsMenu.tsx
  CellEditorPopover.tsx

frontend/src/hooks/
  useScheduleBrush.ts
  usePendingChanges.ts
  useGridSelection.ts

frontend/src/pages/SettingsPage.tsx
```

### 修改

```
frontend/src/App.tsx                 routes + redirects
frontend/src/components/layout/Sidebar.tsx   groups/badges/collapse
frontend/src/components/layout/Header.tsx    month navigator/user menu
frontend/src/components/layout/Layout.tsx    page shell
frontend/src/pages/SchedulePage.tsx          split into components
frontend/src/pages/HousekeepingPage.tsx      remove/redirect
frontend/src/pages/OffDaysPage.tsx           two-column + drawer
frontend/src/pages/EmployeesPage.tsx         drawer/filters
frontend/src/pages/StatsPage.tsx             KPI + tabs
frontend/src/components/schedule/ScheduleTable.tsx  -> ScheduleGrid
frontend/src/styles/globals.css              tokens
frontend/tailwind.config.*                   theme
```

### 不動

```
backend/app/scheduler/**
backend/app/api/routes/schedules.py（除非 UI 需要新聚合端點，先避免）
backend/app/services/schedule_service.py（排班資料格式不變）
frontend/src/utils/printSchedule.ts
frontend/src/utils/offDayMarks.ts
frontend/src/components/schedule/PrintPreviewModal.tsx
```

---

## 8. 分階段實作

### Phase 0：基線與 branch（0.5 天）

- 從 main 開 `v1.3.0-beta`，`version.py = 1.3.0-beta`。
- 跑 baseline：`npm run build`、`npm run lint`、`backend/tests/test_phase8.py`。
- 確認目前 PDF 預覽正常（避免 UI 改動破壞 1.2.3 成果）。

### Phase 1：設計系統 + Layout/導覽（2–3 天）

- Token、共用元件。
- Sidebar 分組、可收合、badge。
- Header 月份導覽、狀態 pill、使用者選單。
- PageHeader 套用到 6 頁。
- 先把現有頁面「外觀」統一，不急著搬功能。

**驗收**：每個頁面看起來一致；導覽可到所有功能；没有功能遺失。

### Phase 2：班表 + 房務合併（3–4 天）

- `ScheduleGrid`、`ScheduleToolbar`、`ScheduleSidePanel`。
- `useScheduleBrush` 抽出，櫃台/房務共用。
- 右側抽屜承載驗證/支援/大夜/版本。
- `⋯` 選單收納破壞性動作。
- 快捷畫筆 popover、undo/redo、鍵盤、拖曳。
- `/housekeeping` redirect。

**驗收**：櫃台/房務切換正常；畫筆/暫存/批次套用/驗證/支援/版本全部回歸；鎖定/發布正常。

### Phase 3：休假/設定/統計（2–3 天）

- 休假頁兩欄 + 求解抽屜。
- 假別管理移到 `/settings`。
- 跨月頁轉到 `/settings?tab=cross-month`（或先保留）。
- 統計頁 KPI + tabs。
- 求解參數集中到 `/settings`。

**驗收**：指定休假/請假/求解/結果/特休/統計/CSV 匯出全部正常。

### Phase 4：Polish / 無障礙 / 回歸（1–2 天）

- focus trap、Esc、aria、鍵盤。
- Toast、確認對話框、錯誤狀態。
- 手機唯讀、平板。
- 全頁 regression + PDF 預覽回歸。
- 更新 README / RELEASE-NOTES / SPEC。
- `npm run build` / `npm run lint` / 後端測試。

**總工時粗估**：9–13 個工作天（依實際回饋調整）。

---

## 9. 測試計畫

### 自動

- `cd frontend && npm run build`
- `cd frontend && npm run lint`
- 後端逐檔（至少）：
  - `tests/test_phase8.py`
  - `tests/test_phase2.py`
  - `tests/test_manager_cap.py`
  - `tests/test_housekeeping.py`
  - `tests/test_night_leave.py`
  - `tests/test_cross_month.py`
- 若完全沒動後端，仍跑上述作為 regression。

### 手動矩陣

| 項目 | 驗收 |
|---|---|
| 導覽 | 6 個舊路由都能到；`/housekeeping`、`/cross-month` 正確轉址 |
| 月份切換 | `‹` `›` `本月` 正常，所有頁同步 |
| 班表（櫃台） | 畫筆、暫存、放棄、檢查套用、強制套用、格位 modal |
| 班表（房務） | A/假別/休、批次套用、無驗證面板、清空房務 |
| 驗證抽屜 | 違規數、跳轉格位、重新整理 |
| 支援/大夜 | 新增/移除/狀態更新、D 備援 |
| 版本 | 快照、還原、Diff |
| 狀態 | 草稿→發布→鎖定→解鎖；鎖定後唯讀 |
| 清空 | 確認對話框、只清正確 group、保留夜班 |
| 休假 | 指定休/請假、月曆、連休計數、求解成功/失敗 |
| 特休 | 週年制、期初、半天、房務 |
| 設定 | 假別 CRUD、跨月、求解參數 |
| 統計 | KPI、tabs、CSV/JSON、備份 |
| PDF | 斜線/交叉、主管留白、房務合併、節日、列印/存 PDF |
| 無障礙 | Tab 順序、Esc、focus、aria |
| 手機 | 唯讀可看，不破版 |

---

## 10. 風險與對策

| 風險 | 對策 |
|---|---|
| 房務與櫃台規則不同，合併後互相污染 | `useScheduleBrush` 接受 `group` 參數；validation/support 只在 front 掛載 |
| 畫面大改造成既有操作習慣斷裂 | Phase 1 只改外觀；Phase 2 才搬互動；保留快捷鍵與主要位置 |
| 重複的 query key / invalidate 邏輯 | 抽出 `useScheduleData` 或集中 query key 常數 |
| 破壞性動作誤按 | 全部收進 `⋯` + `ConfirmDialog`；主要動作只有一個 |
| 設計系統變成無限 scope | 只做本計畫列出的 primitive；不新增圖表庫/動畫庫 |
| 路由轉址造成舊書籤失效 | `<Navigate replace>`；保留 `/housekeeping`、`/cross-month` |
| PDF 回歸 | 不改 `printSchedule`/`offDayMarks`；Phase 4 必測 |
| 後端被不自覺改動 | 只在必要時加 read-only 聚合 API；不動 solver/schema |

---

## 11. 驗收標準（Definition of Done）

- [ ] 所有舊功能都能從新 IA 到達，無功能遺失。
- [ ] `/housekeeping`、`/cross-month` 正確轉址。
- [ ] 班表頁只有一個主要動作；清空/鎖定在 `⋯` 且需確認。
- [ ] 櫃台/房務共用同一套畫筆與暫存邏輯，但規則各自正確。
- [ ] 驗證/支援/大夜/版本改為右側抽屜，表格下方不再堆疊。
- [ ] 月狀態列顯示狀態、違規數、支援數、版本。
- [ ] 共用 UI 元件取代各頁手寫卡片/空狀態/載入。
- [ ] PDF 預覽與 1.2.3 行為一致（斜線/交叉、主管留白、節日、房務）。
- [ ] `npm run build`、`npm run lint`、後端 regression 全數通過。
- [ ] 手機唯讀不破版；鍵盤/焦點/Esc 可用。
- [ ] README / RELEASE-NOTES / SPEC 更新完成。

---

## 12. 版本流程

1. 從 main 開 `v1.3.0-beta`。
2. `backend/app/version.py = "1.3.0-beta"`。
3. 更新 README 目前版本、RELEASE-NOTES 新增 `v1.3.0-beta`。
4. 實作、本地驗證、push beta（CI 產 artifact，不發 Release）。
5. 測試通過 → 合併 main → `version.py = "1.3.0"` → RELEASE-NOTES 標題改 `v1.3.0` → README 同步。
6. 打 `v1.3.0` tag → release workflow 發正式版。
7. **未經確認不主動 commit / push / tag**（依 AGENTS.md）。

---

## 13. 新 Session 開場 Checklist

1. 讀 `AGENTS.md`、`SPEC.md`、本計畫。
2. 確認目前在 `main` 且 clean（HANDOFF 文件不 stage）。
3. 開 `v1.3.0-beta`，改 `version.py = 1.3.0-beta`。
4. 跑 baseline：
   - `cd frontend && npm run build && npm run lint`
   - `cd backend && .venv/bin/python tests/test_phase8.py`
5. 從 **Phase 1** 開始；先做 design tokens + PageHeader + Sidebar/Header。
6. 每完成一個 Phase 就 build/lint，並手動走一次該 Phase 的驗收清單。
7. 有疑問先確認，不自行改 solver/schema。

---

## 14. 待確認事項（新 Session 先問）

1. `/settings` 是否一次收攏「假別 + 跨月 + 求解參數 + 列印設定」，或先只做導覽分組？
2. 員工編輯要維持 Modal，還是改成 Drawer？
3. 手機是否只做唯讀（推薦），還是需要基本編輯？
4. 是否要在 1.3.0 加「本月總覽」獨立頁？目前建議先用班表頁狀態列，不加頁。
5. 統計頁是否保留全部 8 個區塊，或允許合併/收起部分表格？

---

## 15. 參考：1.2.3 已完成的 PDF 行為（不要改壞）

- 休假：每週第一個 `OFF`＝`/`、第二個＝`X`，跨月判斷。
- 主管：`M`／空白預設留白，頁尾「空白＝M 主管班 09:00-17:00」。
- 版面：A4 橫式、兩列日期/星期、粗週框線、單位/類別/姓名、櫃台+房務同表。
- 節日/備註：`month_notes:YYYY:MM`，連續文字 colspan 合併。
- 頁尾：上班時段、假別圖例、注意事項、製表人/單位主管/會計、列印日期。
- 實作：`utils/printSchedule.ts` + `utils/offDayMarks.ts` + `PrintPreviewModal`。
