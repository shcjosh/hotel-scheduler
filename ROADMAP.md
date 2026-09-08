# 未實作方向與備選方案

> 本檔只放「尚未實作」的方向與曾評估未採用的備選方案。已完成項目見
> `RELEASE-NOTES.md`；現況規格見 `SPEC.md`。

## 1. 多館支援（Multi-Branch）

> 2026-08-21 討論的設計草案，未實作。核心洞察：D 班是唯一跨館耦合點；
> 兩館的 A/B/C/M 班彼此獨立。

動機：兩館共用 3 位專職大夜，大夜 D 班橫跨兩館。現行軟體只排單館 A/B/C/M，
D 班由另一館負責人手動 key 入。若兩館都要用這套軟體排所有人的班，
需處理「跨館共用大夜」與「各館獨立排班」。

流程（沿用現行人工流程，自動化大夜）：

1. 3 位大夜劃定指定休假 → 大夜 solver 排兩館每日各 1 個 D（60 槽/月）
2. 排不滿的日子自動產生 d_backup_requests（標記哪館哪天缺 D）
3. 各館 solver 以「共用 D 班表」為固定輸入 + 備援需求，各自獨立排 A/B/C/M

資料模型增量（加欄位、向後相容）：

- `branches` (id, name)
- `users` (id, username, role, branch_id)，role: admin/night/branch
- `employees` + branch_id（NULL = 大夜共用池）
- `schedule_entries` + branch_id（大夜的 D 標記哪館哪天）
- `d_backup_requests` + branch_id

角色與權限：

- admin（Josh）：全館全功能
- night（大夜排班人員）：只排大夜池（D + 備援需求）
- branch（各館排班人員）：只看/改自己館 A/B/C/M + 唯讀看共用 D 班表

模式切換：`APP_MODE = single | multi`（single 預設 = 現況：無登入、無館維度、
D 手動）。登入採 Cloudflare Access 擋門（沿用既有 Cloudflare Tunnel），
app 內不自建帳密。

## 2. 雲端部署（Docker + Cloudflare）

> 2026-08-21 討論，未實作。多館需共用後端 → Docker 容器部署於雲端。

- 資料：維持 SQLite，掛 persistent volume（重部署不可掉資料）
- 雲端選項：Oracle Cloud Always Free VM（終身免費、亞太區、推薦）/
  Hetzner 便宜 VPS（~€4/月）/ Google e2-micro（免費但僅美國區）；
  Render/Railway/Fly.io 免費層無持久磁碟，不適用
- 架構：`[雲端 VM] ─ Docker: hotel-scheduler（FastAPI + static + SQLite volume）`
  ← Cloudflare Tunnel ← Cloudflare Access
- 實作順序（屆時）：資料層（branches/users/branch_id）→ 登入 + 角色 + 切館 UI →
  大夜 solver + 備援串接 → APP_MODE 切換 → Dockerfile + CI 上雲

## 3. 桌面化備選方案（v1.0.2 瀏覽器關閉偵測時評估，未採用）

- pywebview 原生視窗：關閉視窗即結束，最像桌面軟體；需 WebView2 Runtime +
  打包重測，工時較高
- 系統匣圖示（Tray）：右鍵選單「開啟瀏覽器 / 離開」；需 pystray/Pillow

現行採 beacon 關分頁偵測（見 SPEC.md §14）；若日後 beacon 方案不敷使用再評估。
