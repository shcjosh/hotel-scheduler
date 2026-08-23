import json
import re
import time
import urllib.request

from fastapi import APIRouter

from app.version import __version__

router = APIRouter()

REPO = "shcjosh/hotel-scheduler"
GITHUB_LATEST = f"https://api.github.com/repos/{REPO}/releases/latest"
_CACHE_TTL = 6 * 3600  # 6 小時


def _parse_version(v: str) -> tuple[int, int, int]:
    m = re.match(r"v?(\d+)\.(\d+)\.(\d+)", v or "")
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


_cache: dict = {"at": 0.0, "data": None}


@router.get("/updates/check")
def updates_check():
    now = time.time()
    if _cache["data"] is not None and now - _cache["at"] < _CACHE_TTL:
        return _cache["data"]
    try:
        req = urllib.request.Request(
            GITHUB_LATEST, headers={"User-Agent": "hotel-scheduler", "Accept": "application/vnd.github+json"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            rel = json.load(resp)
        latest = _parse_version(rel.get("tag_name", ""))
        current = _parse_version(__version__)
        data = {
            "current_version": __version__,
            "latest_version": rel.get("tag_name", ""),
            "has_update": latest > current,
            "latest_url": rel.get("html_url", ""),
            "name": rel.get("name") or "",
            "published_at": rel.get("published_at") or "",
            "notes": (rel.get("body") or "").strip()[:2000],
        }
    except Exception as exc:
        data = {"current_version": __version__, "latest_version": "", "has_update": False, "error": str(exc)}
    _cache["at"] = now
    _cache["data"] = data
    return data