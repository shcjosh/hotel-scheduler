# 清翼居府中館 飯店排班系統

目前版本：1.1.4

## 系統需求
- Windows 10/11（64 位元）
- Linux（64 位元）
- 不需安裝任何其他軟體（打包版）

## 使用方式（打包版）
- Windows：解壓縮 `hotel-scheduler-*-windows-x64.zip`，雙擊 `hotel-scheduler.exe`
- Linux：解壓縮 `hotel-scheduler-*-linux-x64.tar.gz`，執行 `./hotel-scheduler`
- 啟動後瀏覽器自動開啟 http://localhost:8765
- 關閉瀏覽器分頁或點右上角「關閉系統」按鈕，程式即自動結束

資料庫 `data/scheduler.db` 與執行檔同層，整個資料夾可複製到其他機器直接使用。

## 功能
- A/B/C/D/M 班排班（CP-SAT 求解引擎，13 條硬性 + 9 條軟性約束，含跨月連休公平自動加權）
- 白天班組合規則：週五/六 4 人排 2A2C、3 人排 ABC；平日 3 人排 ABC、避免 4 人
- 員工管理（一般/大夜/C+D備援/管理職，含暱稱、自訂排序、標籤 TAG）
- 二館支援（員工標籤）：完全手動排 A1/C1/D1、豁免個人規則、計入每日覆蓋
- 休假管理（指定休假 + 特休/事假/病假/自訂假別 + 連休計數；圓形 Icon 選人、常用假別單鍵選取）
- 跨月銜接設定與預覽
- 大夜班次於排班表直接輸入（畫筆/格位微調排 D 或休）+ D 班備援指示 + 逐人規則開關（員工表單內設定，含無視所有規則）
- 一鍵排班（整合於休假管理頁）+ 失敗診斷 + 自動支援偵測（排不出時建議缺班日/班）
- 排班表手動調整（頂部快捷畫筆連選多格 + 批次檢查與強制套用）
- 班表狀態管理（草稿/發布/鎖定）+ 版本快照還原 + 調班紀錄
- 整月規則驗證報告（H1~H13 + S1~S10）
- 統計報表 + CSV/JSON 匯出
- 班表匯出 PDF（橫式 A4，週框線 + 週末淺灰底色）
- 可修改抬頭（飯店名稱）
- 瀏覽器關閉自動偵測（關分頁即結束程式）+ 一鍵關閉系統按鈕

## 開發環境
- Backend: Python 3.11+ / FastAPI / OR-Tools / SQLite
- Frontend: React 19 / TypeScript / Tailwind CSS / Vite

## 開發啟動
```bash
# 後端
cd backend && .venv/bin/python -m uvicorn app.api:app --port 8765

# 前端（開發模式，proxy /api → 後端）
cd frontend && npm run dev

# 或單一後端模式（服務前端 build）
cd frontend && npm run build
cd backend && .venv/bin/python run.py
```

## 產生測試資料
```bash
cd backend && .venv/bin/python tests/seed_dev.py
```

## 打包部署
```bash
cd frontend && npm run build
cd ../backend && .venv/bin/python build_spec.py
# 產出：backend/dist/hotel-scheduler/（onedir）
#       backend/dist/hotel-scheduler-{version}-{platform}-{arch}.zip / .tar.gz
```
注意：PyInstaller 不支援跨平台，需在目標平台執行（Windows 產出 .exe + .zip，
Linux 產出 ELF + .tar.gz）。版本號統一在 `backend/app/version.py`。
