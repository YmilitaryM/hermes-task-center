"""Task Center plugin backend, mounted at /api/plugins/task-center/.

Aggregates Hermes sessions into three states: active / interrupted / ended.

Classification (verified against real data):
- ended = ended_at is set and end_reason is a normal end (cron_complete / session_reset / idle_timeout, etc.)
- interrupted = two kinds:
    1) ended_at is set but end_reason is an abnormal interruption (ws_orphan_reap /
       startup_orphan_reap / lru_evict / cron_incomplete_no_output) — data is still in
       the store and can be rescued via resume;
    2) ended_at is still NULL but last_active is past the activity threshold (an orphan
       left by a dead process, not yet swept).
- active = ended_at NULL and last_active within the activity threshold.

Rescue is client-side navigation to /chat?resume=<id>, reusing the dashboard's PTY
resume mechanism. The backend does not resume in-process (session.resume depends on
current_transport(), an RPC contextvar that REST requests lack).
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import APIRouter

router = APIRouter()

# Cap on how many most-recently-active sessions to pull for triage.
_SESSION_LIMIT = 300

# Normal end_reason values: clean finishes, not interruptions.
_NORMAL_END_REASONS = frozenset({
    "cron_complete",
    "session_reset",
    "idle_timeout",
})

# Abnormal end_reason values: connection dropped / process restart / LRU eviction /
# cron no-output. These sessions are still in the store and resumable.
_INTERRUPTED_END_REASONS = frozenset({
    "ws_orphan_reap",
    "startup_orphan_reap",
    "lru_evict",
    "cron_incomplete_no_output",
})

# When ended_at is NULL, a last_active older than this many seconds marks an orphan.
_ACTIVE_TTL_S = 6 * 3600  # 6h, aligned with Hermes session TTL.


def _classify(rows: List[Dict[str, Any]], now: float | None = None) -> Dict[str, Any]:
    now = now if now is not None else time.time()
    active: List[Dict[str, Any]] = []
    interrupted: List[Dict[str, Any]] = []
    ended: List[Dict[str, Any]] = []

    for r in rows:
        ended_at = r.get("ended_at")
        end_reason = str(r.get("end_reason") or "")
        last_active = r.get("last_active")

        if ended_at is not None:
            # ended_at set: normal end vs interrupted, decided by end_reason.
            if end_reason in _INTERRUPTED_END_REASONS:
                interrupted.append(r)
            else:
                ended.append(r)
        else:
            # ended_at NULL: active vs orphan, decided by last_active age.
            try:
                age = now - float(last_active) if last_active else None
            except (TypeError, ValueError):
                age = None
            if age is not None and age < _ACTIVE_TTL_S:
                active.append(r)
            else:
                interrupted.append(r)

    return {"active": active, "interrupted": interrupted, "ended": ended}


def _shape(row: Dict[str, Any]) -> Dict[str, Any]:
    """Expose only the fields the frontend needs; avoid leaking raw fields."""
    return {
        "id": row.get("id"),
        "title": row.get("title") or row.get("preview") or "(Untitled)",
        "source": row.get("source"),
        "model": row.get("model"),
        "started_at": row.get("started_at"),
        "last_active": row.get("last_active"),
        "message_count": row.get("message_count"),
        "end_reason": row.get("end_reason"),
    }


@router.get("/tasks")
def tasks(limit: int = _SESSION_LIMIT) -> Dict[str, Any]:
    from hermes_state import SessionDB

    try:
        db = SessionDB(read_only=True)
    except Exception as exc:
        return {
            "active": [], "interrupted": [], "ended": [],
            "counts": {"active": 0, "interrupted": 0, "ended": 0},
            "error": f"Failed to open session DB: {exc}",
            "generated_at": int(time.time()),
        }

    try:
        rows = db.list_sessions_rich(
            limit=int(limit), order_by_last_active=True,
            project_compression_tips=False,
        )
    finally:
        db.close()

    grouped = _classify(rows)
    payload = {
        k: [_shape(r) for r in v] for k, v in grouped.items()
    }
    payload["counts"] = {k: len(v) for k, v in grouped.items()}
    payload["generated_at"] = int(time.time())
    return payload
