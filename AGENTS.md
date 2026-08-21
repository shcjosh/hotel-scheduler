# AGENTS.md — 開發流程與規則（飯店排班系統）

opencode 每次開啟本專案時會自動載入本文件，作為開發與協作的準則。
詳細規格與架構見 `Hotel Shift Scheduler.txt`（含開發紀錄附錄）。

## 專案簡介
- 飯店排班系統（Hotel Shift Scheduler），portable 桌面應用（瀏覽器介面 + 本機後端）
- Backend: Python + FastAPI + OR-Tools (CP-SAT) + SQLite
- Frontend: React 18 + TypeScript + Vite + Tailwind
- 打包: PyInstaller（onedir）+ GitHub Actions（Windows/Linux 雙平台）

## 版本號規則（SemVer）
- 正式版：`X.Y.Z`（如 `1.0.2`），單一來源在 `backend/app/version.py`
- 測試版：`X.Y.Z-beta`（如 `1.0.3-beta`）
- 開 beta branch 時，`version.py` 要寫成 `X.Y.Z-beta`（不是正式版號）
- 定版合併進 main 時，才把 `version.py` 改為正式 `X.Y.Z`

## 標準開發流程
1. 開 branch `X.Y.Z-beta`（從 main 分出），`version.py = X.Y.Z-beta`
2. 討論 → 實作 → 本地驗證（跑 `backend/tests/`）
   - 同時更新 `README.md`（使用/功能說明）與 `RELEASE-NOTES.md`（新增 `vX.Y.Z-beta` 章節），
     記錄本次 beta 的新功能與規則調整
3. push branch → `build` workflow 自動產雙平台 artifact（windows-x64 + linux-x64），**不建立 Release**
4. 下載 artifact 到實機測試（Windows + Linux）
5. 測試通過 → merge 進 main，`version.py` 改為正式 `X.Y.Z`，`RELEASE-NOTES.md` 標題同步由 `vX.Y.Z-beta` 改為 `vX.Y.Z`，`README.md` 的「目前版本」同步改為 `X.Y.Z`
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
