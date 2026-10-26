# Hotel Shift Scheduler — Docker 試作版
#
# 同一個專案、多種打包：商業邏輯與離線版完全共用，只差「怎麼包、怎麼跑」。
# 離線版用 PyInstaller（run.py：開瀏覽器、單一實例、關分頁自動結束）；
# Docker 版直接跑 uvicorn（不開瀏覽器、lifecycle 永遠 no-op）。
#
# 本地試 build（Tower 上執行）：
#   docker build -t hotel-scheduler:1.2.0-docker-trial .
# 試跑（資料掛 volume，不要進容器可寫層）：
#   docker run -d --name hotel-scheduler-test --network proxynet \
#     -v /mnt/user/appdata/hotel-scheduler-test:/data \
#     hotel-scheduler:1.2.0-docker-trial
#
# 環境變數（已有預設值，列出以便 Unraid 模板對照）：
#   HOST=0.0.0.0  PORT=8765
#   DATA_DIR=/data  DB_PATH=/data/scheduler.db
#   SCHEDULER_DISABLE_LIFECYCLE=1（保險：本 image 根本不走 run.py，lifecycle 自然 no-op）

# ---- Stage 1: 建前端 ----
FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: 後端 runtime ----
FROM python:3.12-slim-bookworm
ARG APP_VERSION=dev
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.title="hotel-scheduler" \
      org.opencontainers.image.source="https://github.com/shcjosh/hotel-scheduler" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_REVISION
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8765 \
    DATA_DIR=/data \
    DB_PATH=/data/scheduler.db \
    STATIC_DIR=/app/frontend/dist \
    SCHEDULER_DISABLE_LIFECYCLE=1
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
# requirements.txt 含 pyinstaller（離線打包用），runtime 不需要，過濾掉以減體積
RUN pip install --no-cache-dir --upgrade pip \
 && grep -viE '^\s*pyinstaller' requirements.txt > /tmp/runtime-requirements.txt \
 && pip install --no-cache-dir -r /tmp/runtime-requirements.txt \
 && rm /tmp/runtime-requirements.txt
COPY backend/app ./app
COPY --from=frontend /src/frontend/dist ./frontend/dist
VOLUME ["/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8765\")}/api/v1/health')"
CMD ["python", "-m", "uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8765"]
