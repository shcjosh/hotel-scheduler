# AGENTS.md — 開發流程與規則（飯店排班系統）

opencode 每次開啟本專案時會自動載入本文件，作為開發與協作的準則。
詳細規格與架構見 `SPEC.md`（純現況，2026-09 起取代舊 `Hotel Shift Scheduler.txt`）；
版本歷史見 `RELEASE-NOTES.md`；未實作方向見 `ROADMAP.md`。

## 專案簡介
- 飯店排班系統（Hotel Shift Scheduler），portable 桌面應用（瀏覽器介面 + 本機後端）
- Backend: Python + FastAPI + OR-Tools (CP-SAT) + SQLite
- Frontend: React 19 + TypeScript + Vite + Tailwind
- 打包: PyInstaller（onedir）+ GitHub Actions（Windows/Linux 雙平台）

## 開發命令（在 backend/、frontend/ 目錄下執行）
- 後端：`.venv\Scripts\python -m uvicorn app.api:app --port 8765`（Windows；Linux 為 `.venv/bin/python`）
- 前端 dev（proxy `/api` → localhost:8765）：`npm run dev`（port 5173）
- 單一後端模式（服務前端 build）：`cd frontend && npm run build` 後 `cd backend && .venv\Scripts\python run.py`
- 測試：`cd backend && .venv\Scripts\python tests/test_phase8.py`（**不是 pytest**，tests/ 是各自帶 `assert` 的獨立腳本，自己設定 temp DB_PATH，逐檔執行）
- 前端 lint：`npm run lint`（oxlint）；`npm run build` = `tsc -b && vite build`（含型別檢查）。後端無 lint/typecheck 指令。
- 產生測試資料：`cd backend && .venv\Scripts\python tests/seed_dev.py`

## 環境變數 / 啟動 quirks
- `DB_PATH`（SQLite 路徑）必須在 import `app.api` **之前**設定；`run.py` 靠 `ensure_data_dir()` 完成，寫測試或獨立腳本時勿在 import 後才設。
- `SCHEDULER_DISABLE_LIFECYCLE=1`：關閉「關瀏覽器分頁即自動結束」偵測（測試/開發時用，見 `run.py`）。
- PyInstaller 不支援跨平台，需在目標平台執行；正式打包一律靠 CI（雙平台），本地打包僅作驗證。

## 臨時對外測試（Cloudflare quick tunnel，外出無區網時用）
本工作區容器已預裝 `cloudflared`（見 `setup.sh`）。外出測試時用單一後端模式 + 臨時網域，
**不要**用 `run.py`（會啟用關分頁自動結束）；用 dev uvicorn 讓它常駐：
```sh
# 1) build 前端（要讓當前 branch 的修正生效）
cd /data/opencode/hotel-scheduler/frontend && npm run build
# 2) 啟動單一後端（dev uvicorn 會 mount frontend/dist，127.0.0.1:8765）
mkdir -p /tmp/opencode/hs-test
cd /data/opencode/hotel-scheduler/backend && \
  setsid .venv/bin/python -m uvicorn app.api:app --host 127.0.0.1 --port 8765 \
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
  **勿用 `pkill -f "cloudflared"` 或 `pkill -f "uvicorn app.api"`**：pattern 會匹配到執行中的
  shell 指令列本身，把 session 砍掉（`[u]vicorn` 的方括號寫法可避開自我匹配）。
- 背景一定要用 `setsid ... &`：一般 `nohup ... &` 會在該次 tool 指令結束時被收掉。
  （本容器為 BusyBox，`setsid` 不支援 `--fork`，直接 `setsid ... &` 即可。）
- 臨時網址每次重開都會換；資料庫是**真實**的 `backend/data/scheduler.db`，測試請小心。

## 版本號規則（SemVer）
- 正式版：`X.Y.Z`，單一來源在 `backend/app/version.py`
- 測試版：`X.Y.Z-beta`
- 開 beta branch 時，`version.py` 要寫成 `X.Y.Z-beta`（不是正式版號）
- 定版合併進 main 時，才把 `version.py` 改為正式 `X.Y.Z`

## 標準開發流程
1. 開 branch `vX.Y.Z-beta`（從 main 分出，注意含 `v` 前綴），`version.py = X.Y.Z-beta`
2. 討論 → 實作 → 本地驗證（逐檔跑 `backend/tests/test_phase*.py`）
   - 同時更新 `README.md`（使用/功能說明）與 `RELEASE-NOTES.md`（新增 `vX.Y.Z-beta` 章節），記錄本次 beta 的新功能與規則調整
3. push branch → `build` workflow 自動產雙平台 artifact（windows-x64 + linux-x64），**不建立 Release**
4. 下載 artifact 到實機測試（Windows + Linux）
5. 測試通過 → merge 進 main，`version.py` 改為正式 `X.Y.Z`，`RELEASE-NOTES.md` 標題由 `vX.Y.Z-beta` 改為 `vX.Y.Z`，`README.md` 的「目前版本」同步改為 `X.Y.Z`
6. 在 main 打 annotated tag `vX.Y.Z` → `release` workflow 觸發正式 Release（雙平台）
7. 提交前檢查：`git status` / `git diff` / `git log --oneline -10`，只 stage 該 stage 的檔案

## CI/CD 觸發規則
- `build` workflow：push 到 `main` 或 `*-beta` branch（或手動 workflow_dispatch）→ 只產 artifact，不發 Release
- `release` workflow：僅由 `vX.Y.Z` tag 觸發（pattern `v[0-9]+.[0-9]+.[0-9]+`，不含 beta 尾綴）→ 產 artifact + 建立正式 GitHub Release
- 關鍵：beta 測試「不打 tag」，只有定版才打 tag 發 Release（避免同版本發兩次、避免 beta 被使用者誤下載）

## 溝通規則
- 若使用者指示有誤、有錯字（誤 key）或語意不明，**先向使用者再次確認**再執行，不要擅自假設。
- 未經使用者明確要求，不主動 commit / push / 打 tag。
- 版本號變更、合併分支、發佈（tag/Release）等操作，先與使用者確認範圍。
