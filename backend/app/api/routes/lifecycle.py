from fastapi import APIRouter

from app.lifecycle import lifecycle

router = APIRouter()


@router.get("/lifecycle/heartbeat")
def heartbeat():
    lifecycle.heartbeat()
    return {"status": "ok"}


@router.post("/lifecycle/shutdown-signal")
def shutdown_signal():
    lifecycle.signal_shutdown()
    return {"status": "ok"}


@router.post("/lifecycle/shutdown")
def shutdown():
    lifecycle.shutdown_now()
    return {"status": "ok"}
