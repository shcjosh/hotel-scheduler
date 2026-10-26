from fastapi import APIRouter

from app.lifecycle import lifecycle

router = APIRouter()


@router.get("/lifecycle/heartbeat")
def heartbeat():
    lifecycle.heartbeat()
    return {"status": "ok"}


@router.get("/lifecycle/status")
def status():
    """前端啟動時查一次：enabled=false（Docker/server 模式）就不送 heartbeat。"""
    return {"enabled": lifecycle.is_enabled()}


@router.post("/lifecycle/shutdown-signal")
def shutdown_signal():
    lifecycle.signal_shutdown()
    return {"status": "ok"}


@router.post("/lifecycle/shutdown")
def shutdown():
    lifecycle.shutdown_now()
    return {"status": "ok"}
