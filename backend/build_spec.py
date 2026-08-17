"""PyInstaller 打包腳本。

使用方式：
    1. 先 build 前端：  cd ../frontend && npm run build
    2. 再執行打包：     cd backend && python build_spec.py

產出在 dist/hotel-scheduler/（onedir 模式）。
注意：PyInstaller 不支援跨平台打包，請在目標 Windows 機器上執行以產生 .exe。
"""
import sys
from pathlib import Path

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if not frontend_dist.exists():
    print("錯誤：請先執行  cd ../frontend && npm run build")
    sys.exit(1)

import PyInstaller.__main__

PyInstaller.__main__.run([
    "run.py",
    "--name=hotel-scheduler",
    "--onedir",
    "--windowed",
    f"--add-data={frontend_dist}:frontend/dist",
    "--hidden-import=uvicorn",
    "--hidden-import=uvicorn.logging",
    "--hidden-import=uvicorn.loops",
    "--hidden-import=uvicorn.loops.auto",
    "--hidden-import=uvicorn.protocols",
    "--hidden-import=uvicorn.protocols.http",
    "--hidden-import=uvicorn.protocols.http.auto",
    "--hidden-import=uvicorn.protocols.websockets",
    "--hidden-import=uvicorn.protocols.websockets.auto",
    "--hidden-import=uvicorn.lifespan",
    "--hidden-import=uvicorn.lifespan.on",
    "--collect-all=ortools",
    "--collect-all=fastapi",
    "--collect-all=pydantic",
    "--collect-all=sqlalchemy",
    "--noconfirm",
    "--clean",
])

print("打包完成！產出在 dist/hotel-scheduler/")
print("部署：將 dist/hotel-scheduler/ 整個資料夾複製到目標機器，雙擊 hotel-scheduler.exe")
