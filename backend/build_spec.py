"""PyInstaller 打包腳本（跨平台）。

使用方式：
    1. 先 build 前端：  cd ../frontend && npm run build
    2. 再執行打包：     cd backend && python build_spec.py

產出：
    dist/hotel-scheduler/                              ← onedir，可直接執行
    dist/hotel-scheduler-{version}-{platform}-{arch}.zip / .tar.gz

注意：PyInstaller 不支援跨平台打包，需在目標平台執行：
    Windows 機器 → 產出 hotel-scheduler.exe + .zip
    Linux 機器   → 產出 hotel-scheduler（ELF）+ .tar.gz
"""
import os
import platform as platform_module
import shutil
import sys
from pathlib import Path

# Windows 主控台預設使用 cp1252 編碼，印中文會拋 UnicodeEncodeError，
# 強制 stdout/stderr 改為 UTF-8（打包完成的提示訊息含中文）。
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None:
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

from app.version import __version__

APP_NAME = "hotel-scheduler"
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if not FRONTEND_DIST.exists():
    print("錯誤：請先執行  cd ../frontend && npm run build")
    sys.exit(1)


def _platform_tag() -> str:
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform.startswith("darwin"):
        return "macos"
    return sys.platform


def _arch_tag() -> str:
    machine = platform_module.machine().lower()
    if machine in ("x86_64", "amd64"):
        return "x64"
    if machine in ("arm64", "aarch64"):
        return "arm64"
    return machine


PLATFORM_TAG = _platform_tag()
ARCH_TAG = _arch_tag()

import PyInstaller.__main__

PyInstaller.__main__.run([
    "run.py",
    f"--name={APP_NAME}",
    "--onedir",
    "--windowed",
    # --add-data 分隔符依平台：Windows 用 ';'，Linux/macOS 用 ':'
    f"--add-data={FRONTEND_DIST}{os.pathsep}frontend/dist",
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

dist_dir = Path(__file__).parent / "dist"
build_dir = dist_dir / APP_NAME
if not build_dir.exists():
    print("錯誤：打包產物不存在")
    sys.exit(1)

artifact_base = str(dist_dir / f"{APP_NAME}-{__version__}-{PLATFORM_TAG}-{ARCH_TAG}")
archive_format = "zip" if sys.platform.startswith("win") else "gztar"
archive = shutil.make_archive(
    artifact_base, archive_format, root_dir=dist_dir, base_dir=APP_NAME
)

print("打包完成！")
print(f"  可執行資料夾：{build_dir}/")
print(f"  壓縮檔：{archive}")
print(f"  版本：{__version__} | 平台：{PLATFORM_TAG} | 架構：{ARCH_TAG}")
