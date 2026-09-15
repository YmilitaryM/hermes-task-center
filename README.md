# Hermes Task Center (任务中心)

A [Hermes Agent](https://hermes-agent.nousresearch.com/) dashboard plugin that gives you a
single pane of glass over every session — triaged into three states, with one-click rescue
for interrupted work.

## What it does

Hermes sessions die in many ways: a WebSocket drops, the process restarts, a cron run
produces no output, a laptop sleeps. The data is still in the session store, but finding
"what did I leave unfinished?" means digging through a long session list.

Task Center classifies your most recent 300 sessions into:

- **Active** — `ended_at` is NULL and last activity is recent
- **Interrupted (待营救)** — ended abnormally (`ws_orphan_reap`, `startup_orphan_reap`,
  `lru_evict`, `cron_incomplete_no_output`) or the process died without cleanup (orphaned)
- **Ended** — finished normally (`cron_complete`, `session_reset`, `idle_timeout`)

Each interrupted session gets a **Rescue** button that navigates to
`/chat?resume=<session_id>` and revives it through the dashboard's PTY resume mechanism.

## Classification logic (why `end_reason`, not process state)

Cross-process there is no global live-transport registry: every `hermes --tui` is its own
process, so the dashboard process cannot see which terminal sessions are alive. The precise
signal is `end_reason` in the session store:

1. `ended_at` set → `end_reason` decides interrupted vs. ended
2. `ended_at` NULL → `last_active` age decides active vs. orphaned (threshold: 6h,
   aligned with Hermes session TTL)

## Install

```bash
# from this repo
hermes plugins install <repo-url>
```

Then **enable it and restart the dashboard** — user plugins are opt-in and the backend
route mounts at dashboard startup only:

```bash
hermes config set plugins.enabled '["task-center"]'
hermes dashboard --stop && hermes dashboard --port 9119 --no-open &
```

(If your dashboard runs under launchd/systemd, just restart that service instead.)

Refresh the browser — a "Task Center" tab appears after Sessions.

## Plugin structure

```
task-center/
├── plugin.yaml            # native plugin manifest (validate gate)
└── dashboard/
    ├── manifest.json      # dashboard tab declaration (/tasks)
    ├── plugin_api.py      # FastAPI router → /api/plugins/task-center/tasks
    └── dist/index.js      # frontend panel (hand-written IIFE, no build step)
```

## Requirements

- Hermes Agent >= 0.21 with the dashboard (`hermes dashboard`)
- No API keys, no external services — reads the local session store only

## License

MIT
