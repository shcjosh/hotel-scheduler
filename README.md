# 清翼居府中館 飯店排班系統

## 系統需求
- Windows 10/11（64 位元）
- 不需安裝任何其他軟體（打包版）

## 使用方式（打包版）
1. 解壓縮 hotel-scheduler.zip
2. 雙擊 `hotel-scheduler.exe`
3. 瀏覽器自動開啟 http://localhost:8000
4. 關閉：關閉瀏覽器後，從工作管理員結束 hotel-scheduler 程序

資料庫 `data/scheduler.db` 與 exe 同層，整個資料夾可複製到其他 Windows 機器直接使用。

## 功能
- A/B/C/D/M 班排班（CP-SAT 求解引擎，13 條硬性 + 8 條軟性約束）
- 員工管理（一般/大夜/C+D備援/管理職）
- 休假管理（指定休假 + 特休 + 連休計數）
- 跨月銜接設定與預覽
- 大夜班表手動輸入 + D 班備援 + 逐人規則開關
- 一鍵排班 + 失敗診斷 + 支援請求
- 排班表手動微調 + 即時合規檢查
- 整月規則驗證報告（H1~H13 + S1~S8）
- 統計報表 + CSV/JSON 匯出
- 可修改抬頭（飯店名稱）

## 開發環境
- Backend: Python 3.11+ / FastAPI / OR-Tools / SQLite
- Frontend: React 18 / TypeScript / Tailwind CSS / Vite

## 開發啟動
```bash
# 後端
cd backend && .venv/bin/python -m uvicorn app.api:app --port 8000

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
# 產出：backend/dist/hotel-scheduler/
```
注意：PyInstaller 不支援跨平台，需在 Windows 上執行以產生 .exe。
