# 飯店排班系統 (Hotel Shift Scheduler) — 規格書（現況）

- 系統版本：`1.1.4`（單一來源 `backend/app/version.py`，FastAPI `/health` 與打包 artifact 命名共用）
- 本檔只描述**現況**（對應實際程式碼）。
- 版本演進與歷史見 `RELEASE-NOTES.md`；未實作方向與備選方案見 `ROADMAP.md`。

## 1. 專案概述

排定 A/B/C/M 班次的自動排班系統。D 班（大夜）由另一館負責人排定後手動輸入；
系統依據硬性/軟性約束以 OR-Tools (CP-SAT) 求解最佳班表。

- 部署形式：Portable 桌面應用（瀏覽器介面 + 本機後端），單一資料夾免安裝，
  Windows / Linux 雙平台；雙擊啟動 → 自動開瀏覽器 → `http://localhost:8765`
- 資料儲存：與執行檔同層的 `data/scheduler.db`（SQLite），整個資料夾可複製攜帶
- 單一後端同時服務 API 與前端靜態檔（`frontend/dist` mount 於 `/`）

技術棧（實際）：

| 層 | 技術 |
|---|---|
| Backend | Python（CI 用 3.12）/ FastAPI / SQLAlchemy 2.0 / Pydantic 2 / OR-Tools CP-SAT / uvicorn[standard] |
| Frontend | React 19 / TypeScript / Vite 8 / Tailwind CSS 3 / TanStack Query 5 / Zustand 5 / react-router-dom 7 / axios / lucide-react |
| DB | SQLite（檔案式） |
| 打包 | PyInstaller 6（onedir）+ GitHub Actions 雙平台 CI |

## 2. 班次定義

| 班次 | 時間 | 每日人數 | 說明 |
|---|---|---|---|
| A | 07:30–15:30 | 1~2 | 早班，每天必須有人 |
| B | 11:30–19:30 | 0~1 | 中班 |
| C | 15:30–23:30 | 1~2 | 晚班，每天必須有人 |
| D | 23:30–07:30 | 0~1 | 大夜，手動輸入（大夜專職格位），系統不排 |
| M | 09:00–17:00 | 無上限 | 管理職日常班；算上班（H4/S1/S6）但不計入 H1 覆蓋 |
| OFF | — | — | 一般休（含指定休假） |
| SPECIAL | — | — | 請假（特休/事假/病假/自訂假別，見 §7） |
| A1 / C1 / D1 | 同 A/C/D | — | 二館支援班次：帶 tag 員工手動排，計入當日 H1 覆蓋（A1→A、C1→C、D1→D） |

- `ALL_SHIFTS = [A,B,C,D,M,OFF,SPECIAL]`；`WORK_SHIFTS = [A,B,C,D,M]`；
  `COVERAGE_BACKUP_SHIFTS = [A,B,C,D]`（S8 用）；`REST_SHIFTS = [OFF,SPECIAL]`
- 前端色盤（`utils/shift.ts`）：A 藍 / B 橙 / C 紫 / D 深藍(白字) / M teal /
  A1 sky / C1 fuchsia / D1 slate(白字) / 休 紅 / 特休 紫紅；指定休假酒紅；
  自訂假別用 `leave_types` 表的自訂色

## 3. 員工角色

| 角色 | role 值 | 排班方式 | 可上班班次 | 說明 |
|---|---|---|---|---|
| 一般員工 | `general` | 自動 | A/B/C | 主要排班對象 |
| 大夜專職 | `night` | 手動（格位輸入，source=night_input） | D/OFF | 班表上直接輸入；求解器豁免 H2/H3/H4/H8/H9/H12（格位固定，見 §4 末） |
| C+D 備援 | `cd_backup` | 自動 | C/D（偏好 C） | D 備援日被指派時固定排 D |
| 管理職 | `manager` | 自動 | M/ABCD（偏好 M） | S8 權重鼓勵上 M；覆蓋不足時可備援 |
| 外部支援 | 任意 + `tag` | 完全手動 | A1/C1/D1 | 帶標籤（如「二館」）員工：豁免所有個人規則、不參與求解，其支援班次計入當日覆蓋 |

- 員工欄位另含：`nickname`（暱稱，顯示與 PDF 用）、`sort_order`（自訂排序，
  排班表/統計/PDF 依序顯示）、`available_shifts`（JSON）、`preferred_shift`
- D 班備援指派鏈（求解前自動）：CD 備援（當日無請假者）→ 管理職 → 無法指派；
  無法指派時求解直接失敗並列出該日與原因，UI 可「略過該備援日並重排」

## 4. 硬性約束（H1~H13，必須滿足）

實作於 `backend/app/scheduler/constraints/hard.py`。

- **H1 每日覆蓋**：A≥1、C≥1（當日該班已有外部支援 A1/C1 則免）；A≤2、C≤2、B≤1、
  D≤1。M 不計入覆蓋、無上限。設定「無視所有規則」的大夜不計入 D 上限。
- **H2 每週休 2 天**：週一至週日為一週，跨月不重置（首週由 H9 處理）。
  完整週（≥5 天）恰好 2 天 OFF；不完整週最多 2 天。OFF = 一般休 + 指定休；
  請假（SPECIAL）不計入。
- **H3 週末休假**：非大夜每人每月週六+週日 OFF 加總**恰好 2**；大夜專職 ≤2。
- **H4 連續上班上限**：任意連續 6 天內至少 1 天 OFF 或 SPECIAL
  （= 最多連續上班 5 天；請假/特休可中斷累計）。
- **H5 班次銜接禁止**（隔 1 天休/特休即可）：C→A、D→A、D→C、D→M。
- **H6 指定休假**：指定休當日固定為 OFF。
- **H7 可用班次**：只能排 `available_shifts ∪ OFF`。
- **H8 跨月銜接**：載入上月最後 5 天。①上月末日班次 → 本月首日套用 H5；
  ②跨月連續上班視窗（上月尾段無休 → 本月開頭 6 天視窗內至少 1 天休/特休）。
- **H9 跨月週**：本月首週 = 上月部分（previous_month_links 的 OFF 天數）+
  本月部分合計恰好 2 天 OFF。
- **H10 一人一天一班**：每人每天恰好 1 個班次（含 OFF）。
- **H11 D 班備援**：備援日被指派者固定排 D，且當日 C 班由他人遞補
  （無人可遞補 → 求解失敗）。
- **H12 連休**：每人每月 1~2 次「連休」（定義見 §8）。
- **H13 大夜固定**：大夜專職班次 = 班表上手動輸入值（source=night_input），
  無輸入的日子視為 OFF。

**大夜規則開關**（`night_rule_overrides` 表，UI 在員工管理編輯表單）：
- 逐人逐條 H2/H3/H4/H12 開關 + 「無視所有規則」（rule_name='ALL'）
- **v1.1.4 起語義**：大夜人員格位全部固定，對其套用個人化約束只會造成無解、
  不會改變結果，因此**求解器一律豁免大夜的 H2/H3/H4/H8/H9/H12**；
  規則開關只影響「驗證報告 / 大夜驗證 / 格位即時驗證」的顯示與過濾
  （「無視所有規則」者整份報告排除、顯示「已略過所有規則檢驗 ✓」）。
  H5/H8 銜接、H10、H13 不受開關影響。

## 5. 軟性約束（S1~S3、S5~S10，最大化目標函數）

實作於 `constraints/soft.py`（S4 已於 v1.0.3 移除，編號不遞補）。

| # | 名稱 | 權重 | 內容 |
|---|---|---|---|
| S1 | 避免 5 連續上班 | -10 | 每出現一個連續 5 天上班視窗 |
| S2 | B→A 避免 | -5 | 含跨月（上月末日為 B → 本月首日 A） |
| S3 | C→B 避免 | -5 | 含跨月 |
| S5 | 偏好班次 | +5 | 非固定格排到 preferred_shift |
| S6 | 公平分配 | -3 | 各員工總上班天數 (max-min) |
| S7 | D 備援最小化 | -2 | cd_backup 於非備援日排 D |
| S8 | 管理職備援最小化 | -15 | manager 排 A/B/C/D（>S5，確保優先上 M；覆蓋不足仍可備援） |
| S9 | 連休 2 次優先 | +8 | 每人連休次數；**跨月公平（K.1 B 級）**：上月連休 <2 次者權重提高為 +14 |
| S10 | 白天班組合 | 見下 | 五六：恰 2A+2C（B=0）+18、恰 1A+1B+1C +15、M 每人 +6；平日：恰 1A+1B+1C +5、白天班 ≥4 人 -10 |

## 6. 班次銜接矩陣

| 前日↓ ＼ 今日→ | A | B | C | D | M | 休/特休 |
|---|---|---|---|---|---|---|
| A | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| B | ⚠️(S2) | ✅ | ✅ | — | ✅ | ✅ |
| C | ❌(H5) | ⚠️(S3) | ✅ | — | ✅ | ✅ |
| D | ❌(H5) | ✅ | ❌(H5) | ✅ | ❌(H5) | ✅ |
| M | ✅ | ✅ | ✅ | — | ✅ | ✅ |

- ❌ 硬性禁止（隔 1 天休/特休可）；⚠️ 軟性避免；「—」= 不會出現
  （D 只由大夜專職/備援排，A/B/C/M 班員工不可能接 D；M 不接 D 同理）
- M→任何班、任何班→M 皆無硬性禁止

## 7. 假別規則

- **指定休假**（designated_off_days）：每人每月 ≤2 天（服務層擋 400、
  診斷也會警告）；計入 H2 每週休 2 天、計入 H3 週末限制、計入連休（= OFF）
- **請假類（special_leaves.leave_type）**：內建 `SPECIAL`（特休）、`PERSONAL`（事假）、
  `SICK`（病假）；自訂假別存 `leave_types` 表（名稱 + 背景色/文字色，可刪除——
  當月班表已使用時防呆提示）。排班約束全部同 SPECIAL：
  - 不計入 H2 每週休 2 天（額外休假）
  - 不佔用指定休假 2 天額度
  - 不受 H3 週末限制（可排週六日）
  - 可中斷連續上班（H4 視為休息日）
  - 與 OFF 同段時計入連休段，但**段內至少需 1 天 OFF**（見 §8）
  - 求解時該格固定為 SPECIAL
- 特休/請假在 UI 與一般休以顏色區分；統計報表分項列出各假別天數

## 8. 連休判定（H12 / count_off_blocks）

一段「連續非上班日」（OFF 或 SPECIAL）滿足以下條件才算 **1 次連休**：

- 段長 ≥ 2 天
- 段內**至少含 1 天 OFF**（一般休/指定休）；整段都只有請假（SPECIAL）不算

即：請假可以延伸連休段（休+特休=2 天連休 ✅；特休+特休 ❌），但
連休段必須以一般休為基礎。連續 ≥3 天仍算 1 次。

| 範例 | 結果 |
|---|---|
| 休 休 | 1 次 ✅ |
| 休 休 + 20/21 號休休 | 2 次 ✅（達上限） |
| 休 特休 | 1 次 ✅（請假延伸，段內有 OFF） |
| 特休 特休 | 不算 ❌（段內無 OFF） |
| 休 休 休（3 天） | 1 次 |
| 跨月 7/30休 7/31休 + 8/1休 8/2休 | 7 月 1 次、8 月 1 次（按月歸屬，本月 1 日重新起算） |

- 每月累計 1~2 次（H12），S9 額外獎勵達成 2 次
- 統計與求解使用同一份 `off_count.count_off_blocks` 邏輯，不會出現兩套判定

## 9. 跨月銜接

`previous_month_links` 表儲存每人上月最後 5 天班次：

1. **資料來源**：`GET /cross-month/{y}/{m}?reload=true` 自動讀上月排班結果；
   無上月資料時可手動輸入（POST）
2. **銜接預覽**：`GET /cross-month/preview/{y}/{m}` 檢查上月末→本月首 H5 合規
3. **跨月週**：H9（見 §4）
4. **跨月連續上班**：H8 的 6 天視窗檢查（見 §4）
5. **跨月連休公平**：data_loader 自動由上月 ScheduleEntry 計算每人上月連休次數，
   餵給 S9 加權（見 §5）

## 10. 資料庫 Schema（SQLite，13 張表）

實作於 `backend/app/database/models.py`（SQLAlchemy 2.0 typed style）。
`connection.init_db()` 於啟動時 create_all + 輕量 migration（ALTER TABLE 補欄位）
+ 寫入預設設定與預設假別。

| 表 | 用途 / 重點欄位 |
|---|---|
| `employees` | name, nickname, tag, sort_order, role(`general`\|`night`\|`cd_backup`\|`manager`), available_shifts(JSON), preferred_shift, scheduling_mode(`auto`\|`manual`), is_active（軟刪除） |
| `schedule_entries` | employee_id, y/m/d, shift, source(`auto`\|`manual`\|`night_input`\|`backup`\|`designated`\|`special`)；UNIQUE(emp,y,m,d) |
| `designated_off_days` | 指定休假；每人每月 ≤2（應用層驗證）；UNIQUE(emp,y,m,d) |
| `special_leaves` | 請假；+ `leave_type`（預設 SPECIAL）；UNIQUE(emp,y,m,d) |
| `leave_types` | code(PK), name, color_bg, color_text, is_builtin, is_active |
| `schedule_statuses` | PK(y,m), status(`draft`\|`published`\|`locked`) |
| `schedule_snapshots` | version_number(v1,v2...), name, schedule_data(完整班表 JSON), created_at |
| `schedule_change_logs` | y/m, employee_id, day, old_shift, new_shift, reason, created_at |
| `d_backup_requests` | y/m/d（UNIQUE）, assigned_employee_id, status(`pending`\|`assigned`\|`failed`), note |
| `previous_month_links` | 每人上月末 5 天班次（day_5~day_1_shift）, source(`auto`\|`manual`)；UNIQUE(emp,y,m) |
| `night_rule_overrides` | PK 邏輯 (employee_id, rule_name)；rule_name=`H2`/`H3`/`H4`/`H12`/`ALL`（ALL=無視所有規則）, enabled |
| `support_requests` | y/m/d, shift(`A`\|`C`), reason, status(`open`\|`resolved`\|`ignored`), resolution, source(`auto`\|`manual`)；day=0 表示「全月」（結構性缺人）；UNIQUE(y,m,d,shift) |
| `settings` | key(PK)-value；預設 `hotel_name=清翼居府中館`、`user_name`；另存 solve meta：`solve:{y}:{m}` = JSON{status, objective_value, solve_time, soft_constraint_stats} |

## 11. API 端點（prefix `/api/v1`，共 ~55 個）

路由定義在 `backend/app/api/routes/`（FastAPI app 於 `app/api/__init__.py`，
靜態檔 mount 在路由註冊之後，`/api/*` 優先匹配）。

- **員工** `employees`：GET/POST `/employees`、POST `/employees/reorder`、
  GET/PUT/DELETE `/employees/{id}`（DELETE 為軟刪除）
- **班表** `schedules`：GET `/schedules/{y}/{m}`（回 schedule+sources+leave_details+status）、
  PUT `/schedules/{emp}/{y}/{m}/{d}`（格位微調；大夜可改 D/OFF、source 維持 night_input；
  鎖定月份 403；已發布月份可填調班原因並寫入 change log）、
  DELETE `/schedules/{y}/{m}`（清空當月，保留 night_input）、
  POST `/schedules/validate-cell`（假設性格位檢查，含 H4 視窗/H5 前後銜接/H7/H12+S2/S3，
  尊重大夜規則開關）、GET `/schedules/{y}/{m}/validation`（整月規則驗證報告）、
  POST `/schedules/adjust/preview`、POST `/schedules/adjust/apply`（當月臨時異動，見 §13.4）、
  GET/POST `/schedule-entries`、GET/PUT/DELETE `/schedule-entries/{id}`
- **休假** `off_days`：GET `/off-days/{y}/{m}`、GET `/off-days/summary/{y}/{m}`（連休計數+run_days）、
  POST/DELETE `/off-days/designated/...`、POST/DELETE `/off-days/special/...`
- **假別** `leave_types`：GET/POST `/leave-types`、PUT/DELETE `/leave-types/{code}`
- **班表中繼** `schedule_meta`：GET/PUT `/schedule-status/{y}/{m}`（draft/published/locked，
  publish 會自動建快照）、GET/POST `/snapshots/{y}/{m}`、POST `/snapshots/{id}/restore`、
  GET `/snapshots/diff/{a}/{b}`、GET `/change-logs/{y}/{m}`
- **跨月** `cross_month`：GET `/cross-month/{y}/{m}`（`?reload=true` 自動載入）、
  POST `/cross-month/{y}/{m}`、GET `/cross-month/preview/{y}/{m}`
- **大夜/備援** `night`：GET/PUT/DELETE `/night/{y}/{m}` 系列逐日輸入、
  GET `/night/{y}/{m}/validation`（大夜人員合規驗證，尊重開關）、
  GET/PUT `/night/rule-overrides/...`、POST `/night/backup-request`、
  GET `/night/backup-requests/{y}/{m}`、DELETE `/night/backup-request/{id}` 或 `/{y}/{m}/{d}`
- **支援請求** `support`：GET `/support-requests/{y}/{m}`、POST `/support-requests`、
  PUT/DELETE `/support-requests/{id}`
- **排班** `solve`：POST `/solve`（body: year, month, max_solve_time, enable_d_backup；
  成功存班表+自動快照+solve meta；locked 403；失敗自動產生支援請求，見 §13.3）
- **設定** `settings`：GET `/settings`、GET/PUT `/settings/{key}`
- **統計/匯出**：GET `/stats/{y}/{m}`（含上月連休次數與 S1~S10 細項）、
  GET `/export/{y}/{m}/csv`、GET `/export/{y}/{m}/json`
- **系統**：GET `/health`（含版本號）、GET `/updates/check`（比對 GitHub 最新 Release，
  6 小時快取；前端有新版時顯示 UpdateBanner）、
  GET `/lifecycle/heartbeat`、POST `/lifecycle/shutdown-signal`、POST `/lifecycle/shutdown`

## 12. 前端

5 個路由（大夜班表頁已於 v1.1.4 整併進排班表總覽、一鍵排班整合於休假管理頁）：

| 路由 | 頁面 | 重點 |
|---|---|---|
| `/` | SchedulePage 排班表總覽 | 月排班表（橫軸日期、縱軸員工依 sort_order）+ 每日覆蓋列 + 快捷畫筆（單擊連選多格、脈衝高亮暫存、批次「檢查並套用」/強制套用/放棄）+ 格位微調 modal + 大夜格位直接輸入 D/休 + D 班備援指示面板 + 支援請求面板 + 版本歷史 drawer（還原/Diff）+ 整月規則驗證報告（預設收合）+ 圖例 + 清空班表/清空大夜 + PDF 匯出（橫式 A4、週框線、週末淺灰、含圖例） |
| `/employees` | EmployeesPage | CRUD + 角色/可用班次/偏好 + 暱稱/標籤/排序（上移下移）+ 大夜規則開關（含無視所有規則） |
| `/off-days` | OffDaysPage | 圓形 Icon 選人 + 常用假別單鍵（指定休/特休/事假/病假）+ 自訂假別管理 + 連休計數器 + 「開始排班」按鈕與 D 備援開關 + 排班結果/診斷顯示（SolveResult） |
| `/cross-month` | CrossMonthPage | 上月末 5 天自動載入/手動輸入 + 銜接預覽 + 跨月週休假摘要 |
| `/stats` | StatsPage | 每人班次/休假統計 + 公平性 + 每日覆蓋 + S1~S10 細項 + 上月連休「優先 2 次」標記 + 調班紀錄 + 求解時間上限設定 + CSV/JSON 匯出 |

- 狀態管理：Zustand `uiStore`（currentYear/currentMonth）；資料：TanStack Query
- Lifecycle：`lifecycle.ts` 僅於 PROD build 啟動（見 §15）
- `UpdateBanner`：`/updates/check` 有新版時顯示提示橫幅

## 13. 排班引擎

### 13.1 求解流程（`engine.solve`）

1. `data_loader.load`：員工（排除帶 tag 者）、指定休、請假、跨月 links、
   大夜班（schedule_entries source=night_input）、D 備援請求與指派鏈、
   外部支援（tag 員工的 A1/C1/D1 → 當日該班覆蓋）、支援請求（open/resolved
   皆視為有人；ignored 不算）、規則開關、上月每人連休次數
2. `build_fixed`：固定格 = 大夜全部格位、指定休=OFF、請假=SPECIAL、備援日=D
3. 建變數：每格 ALL_SHIFTS 各一 BoolVar（固定格不省略變數，用約束鎖定）
4. H1~H13 → S1~S10 → `model.Maximize`
5. 求解：`max_time_in_seconds`（預設 30s，請求可調）、8 workers、
   `SCHEDULER_LOG_SEARCH_PROGRESS=1` 可開求解 log
6. 成功：提取班表 + 軟性約束統計；失敗：`diagnose_detailed` 結構化診斷

### 13.2 當月臨時異動（`engine.solve_adjust`，v1.0.7）

員工突發請假時局部重排：凍結今天以前的格位 → 新請假固定 SPECIAL →
目標 = Minimize(受影響人數 × 1000 + 變動格數)（不用 S1~S10 偏好，
避免為了優化多改）。API：`/schedules/adjust/preview`（dry-run diff）→
`/schedules/adjust/apply`（逐格 upsert + change log）。

### 13.3 排班失敗的自動支援偵測

`solve` 失敗且非「備援無法指派」時：

1. 結構性檢查（無人可上 A/C → 產生 day=0 的全月支援請求）
2. `engine.diagnose_support_needs`：加「外部支援」布林變數並 Minimize 支援槽數，
   精準找出最少缺班的 (日, 班)，產生對應支援請求
3. 重新載入資料再解一次（支援請求視為有人 → 放寬當日 H1）
4. 仍失敗 → `auto_generate_from_diagnostics` 依診斷產生支援請求

### 13.4 失敗診斷（`diagnostics.py`）

cause 類型：`coverage_gap`（無人可上 A/C）、`over_capacity`（非大夜 >7 人）、
`designated_over_limit`（指定休 >2）、`leave_weekend_conflict`（平日請假過多
被迫週末休 >2）、`weekly_off_shortage`（請假涵蓋整週導致無天數排 OFF）、
`d_backup_gap`（備援日無人遞補 C）、`d_backup_unfillable`（備援無法指派）、
`cross_month_conflict`（上月末班次與本月 1 日固定格衝突）、`night_violation`、
`unknown`。各 cause 含 severity/message/suggestion。

### 13.5 規則驗證器（`validator.py`）

`validate()`（H1~H13 結構化違規）+ `validate_soft()`（S1/S2/S3/S7/S8/S9/S10 警告；
S5/S6 由 `count_preferred_unsatisfied` / `compute_fairness_spread` 另算）+
`RULE_DESCRIPTIONS`（H1~H13 + S1~S3、S5~S10 共 22 條）。用於整月驗證報告、
大夜驗證、validate-cell、診斷。全部尊重「無視所有規則」的排除。

## 14. 啟動與生命週期

- 入口 `run.py`（開發與打包通用）：確保 `data/` 目錄與 `DB_PATH`（必須在
  import `app.api` 之前設定）→ 直接 `from app.api import app`（讓 PyInstaller
  追蹤依賴）→ port 偵測（已占用 = 既有實例在跑 → 只開瀏覽器連過去即退出）→
  延遲開瀏覽器 → uvicorn 啟動 + `lifecycle.enable(server)`
- **後台關閉（v1.1.2 現況：只靠 beacon）**：
  - 關分頁 → 前端 `pagehide`/`beforeunload` 送 `sendBeacon /lifecycle/shutdown-signal`
    → 後端延遲 3 秒關閉；期間收到新 heartbeat（refresh 情境）即取消
  - UI「關閉系統」按鈕 → `POST /lifecycle/shutdown` → 1 秒後關閉
  - **心跳超時不再觸發關閉**（避免瀏覽器省電/凍結背景分頁時誤關）；
    當機殘留後台由下次啟動的 port 偵測兜底（單一實例）
  - 開發模式（uvicorn app.api:app）未 enable → 一切 no-op
- 環境變數：`DB_PATH`、`DATA_DIR`、`STATIC_DIR`、`HOST`（預設 127.0.0.1）、
  `PORT`（預設 8765）、`SCHEDULER_DISABLE_LIFECYCLE=1`（測試用）、
  `SCHEDULER_LOG_SEARCH_PROGRESS=1`（求解 log）

## 15. 打包與 CI

- 本地打包：`cd frontend && npm run build` → `cd backend && .venv/bin/python build_spec.py`
  → PyInstaller onedir + windowed（`--add-data frontend/dist`、
  `--collect-all ortools/fastapi/pydantic/sqlalchemy`、uvicorn hidden-imports）
  → `dist/hotel-scheduler/` + `hotel-scheduler-{version}-{platform}-{arch}.zip|.tar.gz`
- **PyInstaller 不支援跨平台**：正式打包一律走 CI
- `.github/workflows/build.yml`：push 到 `main` 或 `*-beta`（或手動）→
  雙平台 matrix（windows-latest / ubuntu-latest，Python 3.12 + Node 22）→
  只上傳 artifact，**不建 Release**
- `.github/workflows/release.yml`：僅 `v[0-9]+.[0-9]+.[0-9]+` tag 觸發
  （beta tag 不觸發）→ artifact + 正式 GitHub Release
- 版本號單一來源：`backend/app/version.py`；SemVer，測試版為 `X.Y.Z-beta`

## 16. 開發與測試

```bash
# 後端（開發，lifecycle no-op）
cd backend && .venv/bin/python -m uvicorn app.api:app --port 8765
# 前端 dev（proxy /api → 8765）
cd frontend && npm run dev
# 單一後端模式（服務前端 build）
cd frontend && npm run build && cd ../backend && .venv/bin/python run.py
# 測試（逐檔執行，各自帶 assert 與 temp DB_PATH，非 pytest）
cd backend && .venv/bin/python tests/test_phase2.py   # 硬性約束（另有 phase3~8、test_night_merge）
# 測試資料
cd backend && .venv/bin/python tests/seed_dev.py
```

前端 lint：`npm run lint`（oxlint）；build：`npm run build`（tsc -b + vite build）。

## 17. 已知限制

1. **員工人數上限約 7 人（非大夜）**：H1 每日上班上限 A2+B1+C2=5 工班
   （D 歸大夜、M 不計），每人每週 5 工天 → 每週 35 工班 ÷ 5 = 7 人。
   超過會 INFEASIBLE，診斷報 `over_capacity`。
2. M 班無每日上限（管理職通常 0~1 人）；多管理職需自行評估。
3. `previous_month_links` 只存 5 天：月初為週日時跨月 H4 視窗需 6 天，
   最舊 1 天缺 → 該視窗以「資料不足」跳過（少見邊界）。
4. 員工人數 >7 或規則組合極端時可能無解；診斷會給出可能原因與建議。
5. `updates/check` 依賴 GitHub Releases 的公開 API（離線環境僅回 error 欄位）。
