"""任务中心插件后端，挂载在 /api/plugins/task-center/。

聚合 Hermes 会话三态：活跃 / 中断待营救 / 已结束。

判定依据（经真实数据验证）：
- 已结束 = ended_at 有值，且 end_reason 是正常结束（cron_complete / session_reset / idle_timeout 等）
- 中断待营救 = 两类：
    1) ended_at 有值，但 end_reason 是异常中断（ws_orphan_reap / startup_orphan_reap / lru_evict /
       cron_incomplete_no_output）——数据仍在库，可 resume 救回；
    2) ended_at 仍为 NULL，但 last_active 已超过活跃阈值（进程死掉留下的孤儿，orphan sweep 尚未收尾）。
- 活跃 = ended_at NULL 且 last_active 在活跃阈值内。

营救（resume）靠前端导航到 /chat?resume=<id> 复用 dashboard 现有 PTY resume 机制，
后端不做进程内 resume（session.resume 依赖 current_transport() 这个 RPC contextvar，REST 上下文没有）。
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import APIRouter

router = APIRouter()

# 最近活跃的会话最多拉这么多条做三态分组。
_SESSION_LIMIT = 300

# 正常结束的 end_reason：主动/例行结束，不是"中断"。
_NORMAL_END_REASONS = frozenset({
    "cron_complete",
    "session_reset",
    "idle_timeout",
})

# 异常中断的 end_reason：连接断开被孤儿回收、进程重启孤儿、LRU 淘汰、cron 无输出。
# 这些会话数据仍在库，resume 可救回。
_INTERRUPTED_END_REASONS = frozenset({
    "ws_orphan_reap",
    "startup_orphan_reap",
    "lru_evict",
    "cron_incomplete_no_output",
})

# ended_at 仍为 NULL 时，last_active 超过这个秒数判定为"孤儿"（进程死掉未收尾）。
_ACTIVE_TTL_S = 6 * 3600  # 6 小时，对齐 Hermes 的 session TTL。


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
            # 已结束：正常结束 vs 异常中断，用 end_reason 区分。
            if end_reason in _INTERRUPTED_END_REASONS:
                interrupted.append(r)
            else:
                ended.append(r)
        else:
            # ended_at NULL：活跃 vs 孤儿，用 last_active 年龄区分。
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
    """只把前端需要的字段吐出去，避免原始字段泄漏。"""
    return {
        "id": row.get("id"),
        "title": row.get("title") or row.get("preview") or "(未命名)",
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
            "error": f"无法打开会话库: {exc}",
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
