# AGENTS.md — 開發流程與規則（飯店排班系統）

Antigravity（於 `agy-vm` Ubuntu 24.04 LTS 環境，獨立 Project `hotel-scheduler`，路徑 `/data/opencode/hotel-scheduler`）每次開啟本專案時會自動載入本文件，作為開發與協作的準則。
詳細規格與架構見 `SPEC.md`（純現況）；
版本歷史見 `RELEASE-NOTES.md`；未實作方向見 `ROADMAP.md`；
Docker 部署現況見 `HANDOFF-docker-*.md`。

## 專案簡介
- 飯店排班系統（Hotel Shift Scheduler），提供雙軌部署形式：
  1. **Portable 桌面版**：Windows 離線單一檔案（PyInstaller onedir），點擊執行自動開瀏覽器（`http://localhost:8765`），關閉分頁自動結束後端。
  2. **Docker 版**：多階段建置 image，供 NAS/伺服器（Unraid / Tower）部署，直接跑 uvicorn，常駐服務 API 與前端靜態檔（lifecycle 關閉機制自動停用）。
- Backend: Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic 2 + OR-Tools (CP-SAT) + SQLite
- Frontend: React 19 + TypeScript + Vite 8 + Tailwind CSS 3 + TanStack Query 5 + Zustand 5
- 打包 / 交付:
  - 桌面版：PyInstaller（Windows `.zip`，正式 release 保留 Linux `.tar.gz`）
  - 容器版：Docker Buildx + GHCR（`ghcr.io/shcjosh/hotel-scheduler:<version>`）

## 開發命令（在 backend/、frontend/ 目錄下執行）
- 後端開發（dev uvicorn）：
  - Linux: `.venv/bin/python -m uvicorn app.api:app --port 8765`（或系統 `python3`）
  - Windows: `.venv\Scripts\python -m uvicorn app.api:app --port 8765`
- 前端 dev（proxy `/api` → localhost:8765）：`npm run dev`（port 5173）
- 單一後端模式（服務前端 build 產物）：`cd frontend && npm run build` 後 `cd backend && python run.py`
- 測試：
  - **不是 pytest**，`backend/tests/` 是各自帶 `assert` 的獨立 Python 腳本，各檔自行設置 temp `DB_PATH`。
  - 批次逐檔執行全部測試：
    `cd backend && for t in tests/test_*.py; do echo "=== $t ==="; python3 "$t" || break; done`
  - 單獨執行特定功能測試（例）：`cd backend && python3 tests/test_trainee.py`
- 前端 lint / 型別檢查：
  - `npm run lint`（oxlint）
  - `npm run build`（`tsc -b && vite build`，含完整 TypeScript 型別檢查）
- 產生測試資料：`cd backend && python3 tests/seed_dev.py`

## 環境變數與運行特性（Quirks）
- `DB_PATH`（SQLite 路徑）**必須在 import `app.api` 之前設定**；`run.py` 靠 `ensure_data_dir()` 完成，寫測試或獨立腳本時勿在 import 後才設。
- `SCHEDULER_DISABLE_LIFECYCLE=1`：關閉「關瀏覽器分頁即自動結束」偵測（Docker 模式、dev 模式與測試環境必設）。
- Docker 容器預設環境：
  - `HOST=0.0.0.0`, `PORT=8765`, `DATA_DIR=/data`, `DB_PATH=/data/scheduler.db`, `STATIC_DIR=/app/frontend/dist`
  - 容器以非 desktop 模式常駐，內部已設 `SCHEDULER_DISABLE_LIFECYCLE=1`。
- 本機環境備忘（`agy-vm`）：
  - 系統為 Ubuntu 24.04 LTS (x86_64 glibc)，若虛擬環境損壞或不存在，可透過 `python3 -m venv .venv` 重建並安裝 `requirements.txt`。

## 正式部署與 Docker 規範（Tower / Unraid）
- **正式站現況**：
  - 伺服器：Tower (Unraid)，容器名稱 `hotel-scheduler`
  - Image：`ghcr.io/shcjosh/hotel-scheduler:<version>`
  - 區網網址：`http://192.168.0.10:8765`
  - 對外網址：`https://scheduler.shcjosh.uk`（經 SWAG 反向代理 + Cloudflare Access email OTP 認證）
  - 資料庫持久化：`/mnt/user/appdata/hotel-scheduler` 掛載至容器內 `/data`（每日 04:15 自動備份）
- **⚠️ Docker 發佈硬規則**：
  1. **一個版號一個 tag，絕對不覆寫（overwrite）重推同一個 tag**：
     Unraid WebUI 更新是依據模板 tag 拉取最新 digest，覆寫同名 tag 會造成版號與實體 digest 脫節，無法由 `/api/v1/health` 驗證版本或進行回滾。若有修復請開新 tag（如 `1.3.2-beta2` 或直接下一版）。
  2. **不可更改容器內的 `DATA_DIR=/data` 與 `DB_PATH=/data/scheduler.db` 預設路徑**（Tower 模板與備份排程綁定）。
  3. **維持 `/api/v1/health` 回應格式**（`{"status":"ok","version":...}`），健康檢查與自動化腳本皆依賴此格式。

## 臨時對外測試（Cloudflare quick tunnel，外出無區網時用）
外出測試時可用單一後端模式 + `cloudflared` 臨時網域，
**不要**用 `run.py`（會啟用關分頁自動結束）；用 dev uvicorn 讓它常駐：
```sh
# 1) build 前端（要讓當前 branch 的修正生效）
cd /data/opencode/hotel-scheduler/frontend && npm run build
# 2) 啟動單一後端（dev uvicorn 會 mount frontend/dist，127.0.0.1:8765）
mkdir -p /tmp/opencode/hs-test
cd /data/opencode/hotel-scheduler/backend && \
  setsid python3 -m uvicorn app.api:app --host 127.0.0.1 --port 8765 \
  </dev/null >/tmp/opencode/hs-test/backend.log 2>&1 &
# 3) 開臨時 tunnel
setsid cloudflared tunnel --url http://localhost:8765 --no-autoupdate \
  </dev/null >/tmp/opencode/hs-test/cf.log 2>&1 &
# 4) 抓網址 + 驗證
sleep 12
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/opencode/hs-test/cf.log | head -1
curl -s https://<剛抓到的網址>/api/v1/health   # 應回 {"status":"ok","version":...}
```
- 停止：`pkill -x cloudflared` 然後 `pkill -f "[u]vicorn app.api"`。
  **勿用 `pkill -f "cloudflared"` 或 `pkill -f "uvicorn app.api"`**：pattern 會匹配到執行中的 shell 指令列本身，把 session 砍掉（`[u]vicorn` 的方括號寫法可避開自我匹配）。
- 背景一定要用 `setsid ... &`：一般 `nohup ... &` 會在該次 tool 指令結束時被收掉。
- 臨時網址每次重開都會換；資料庫是**真實**的 `backend/data/scheduler.db`，測試請小心。

## 版本號規則（SemVer）
- 正式版：`X.Y.Z`，單一來源在 `backend/app/version.py`
- 測試版：`X.Y.Z-beta`（或 `X.Y.Z-beta2` 等）
- 開 beta branch 時，`version.py` 要寫成 `X.Y.Z-beta`（不是正式版號）
- 定版合併進 main 時，才把 `version.py` 改為正式 `X.Y.Z`

## 標準開發流程
1. 開 branch `vX.Y.Z-beta`（從 main 分出，注意含 `v` 前綴），`version.py = X.Y.Z-beta`
2. 討論 → 實作 → 本地驗證：
   - 後端：逐檔跑 `backend/tests/test_*.py`
   - 前端：`npm run lint` 與 `npm run build`
   - 文件同步：更新 `README.md`（功能與使用說明）、`SPEC.md`（若有新增規則/約束）與 `RELEASE-NOTES.md`（新增本次版本章節）
3. push branch → `build` workflow 自動建置：
   - 產出 Windows portable zip artifact
   - 建置 Docker image 並推送至 GHCR（`ghcr.io/shcjosh/hotel-scheduler:X.Y.Z-beta`）
   - **不建立 Release**
4. 驗證與測試：
   - Windows 桌面環境下載 zip artifact 測試
   - Docker 環境由 Tower (Unraid) 模板拉取對應 beta tag 測試
5. 測試通過 → merge 進 main：
   - `version.py` 改為正式 `X.Y.Z`
   - `RELEASE-NOTES.md` 標題由 `vX.Y.Z-beta` 改為 `vX.Y.Z`
   - `README.md`、`SPEC.md` 的「系統版本」同步改為 `X.Y.Z`
6. 在 main 打 annotated tag `vX.Y.Z` → `release` workflow 觸發正式 Release（產出 Windows `.zip` + Linux `.tar.gz` 雙平台 PyInstaller 產物並建立 GitHub Release）
7. 提交前檢查：`git status` / `git diff` / `git log --oneline -10`，只 stage 該 stage 的檔案

## CI/CD 觸發規則總結
- `build` workflow（push 到 `main` 或 `*-beta` branch，或手動 trigger）：
  - 產 Windows-x64 artifact（v1.2.1 起已取消 Linux portable，改由 Docker 取代）
  - 產 Docker image 推送至 GHCR（tag 對應 `version.py` 版號）
  - 只產產物與 image，**不建立 GitHub Release**
- `release` workflow（僅由 `v[0-9]+.[0-9]+.[0-9]+` tag 觸發，不含 beta 尾綴）：
  - 產雙平台 artifact（windows-x64 `.zip` + linux-x64 `.tar.gz`）
  - 建立正式 GitHub Release
- 關鍵：beta 測試「不打 git tag」，只有定版才打 tag 發 Release（避免同版本發兩次、避免 beta 被使用者誤下載）

## 溝通規則
- 若使用者指示有誤、有錯字（誤 key）或語意不明，**先向使用者再次確認**再執行，不要擅自假設。
- 未經使用者明確要求，不主動 commit / push / 打 tag。
- 版本號變更、合併分支、發佈（tag/Release）等操作，先與使用者確認範圍。
