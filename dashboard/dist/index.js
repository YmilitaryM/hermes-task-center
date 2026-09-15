(function () {
  "use strict";
  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !window.__HERMES_PLUGINS__) return;

  const React = SDK.React;
  const hooks = SDK.hooks || {};
  const useState = hooks.useState;
  const useEffect = hooks.useEffect;
  const useCallback = hooks.useCallback;
  const C = SDK.components || {};
  const Button = C.Button;
  const Badge = C.Badge;
  const fetchJSON = SDK.fetchJSON;

  const API = "/api/plugins/task-center";

  function fmtTime(ts) {
    if (!ts) return "—";
    const s = Number(ts);
    if (!isFinite(s) || s <= 0) return "—";
    const diff = Math.floor(Date.now() / 1000 - s);
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
    const d = new Date(s * 1000);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return mm + "-" + dd;
  }

  function reasonLabel(r) {
    if (!r) return null;
    const map = {
      ws_orphan_reap: "连接断开",
      startup_orphan_reap: "进程重启",
      lru_evict: "内存回收",
      cron_incomplete_no_output: "无输出中断",
      idle_timeout: "空闲超时",
      session_reset: "会话重置",
      cron_complete: "定时任务完成",
    };
    return map[r] || r;
  }

  const TONE = {
    active: { variant: "default", label: "当前任务" },
    interrupted: { variant: "destructive", label: "中断待营救" },
    ended: { variant: "secondary", label: "已结束" },
  };

  function SessionRow(props) {
    const s = props.s;
    const kind = props.kind;
    const meta = [
      s.source ? "来源 " + s.source : null,
      kind === "interrupted" && s.end_reason ? "原因 " + reasonLabel(s.end_reason) : null,
      s.model ? s.model : null,
      s.message_count != null ? s.message_count + " 条消息" : null,
      "最后活跃 " + fmtTime(s.last_active),
    ].filter(Boolean).join(" · ");

    return React.createElement(
      "div",
      {
        style: {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid var(--ui-stroke-secondary, rgba(128,128,128,0.18))",
        },
      },
      React.createElement(
        "div",
        { style: { flex: 1, minWidth: 0, marginRight: 12 } },
        React.createElement(
          "div",
          { style: { fontWeight: 600, marginBottom: 3, wordBreak: "break-all", lineHeight: 1.4 } },
          s.title
        ),
        React.createElement(
          "div",
          { style: { fontSize: 12, opacity: 0.6, lineHeight: 1.4 } },
          meta
        )
      ),
      kind === "interrupted" && s.id
        ? React.createElement(
            Button,
            {
              size: "sm",
              onClick: function () {
                window.location.href = "/chat?resume=" + encodeURIComponent(s.id);
              },
            },
            "营救"
          )
        : null
    );
  }

  function Section(props) {
    const title = props.title;
    const tone = props.tone;
    const items = props.items || [];
    const emptyText = props.emptyText;
    const badge = TONE[tone];

    return React.createElement(
      "div",
      { style: { marginBottom: 26 } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
        React.createElement(
          "h3",
          { style: { margin: 0, fontSize: 15, fontWeight: 700 } },
          title
        ),
        badge
          ? React.createElement(Badge, { variant: badge.variant }, badge.label + " · " + items.length)
          : null
      ),
      items.length === 0
        ? React.createElement(
            "div",
            { style: { fontSize: 13, opacity: 0.5, padding: "10px 0" } },
            emptyText
          )
        : items.map(function (s) {
            return React.createElement(SessionRow, { key: s.id, s: s, kind: tone });
          })
    );
  }

  function Stat(props) {
    const c =
      props.tone === "interrupted"
        ? "var(--ui-text-danger, #e5484d)"
        : props.tone === "active"
          ? "var(--ui-accent, #4c8dff)"
          : "var(--ui-text-secondary, #8a8f98)";
    return React.createElement(
      "div",
      {
        style: {
          flex: 1, padding: "14px 16px", borderRadius: 8,
          border: "1px solid var(--ui-stroke-secondary, rgba(128,128,128,0.18))",
        },
      },
      React.createElement("div", { style: { fontSize: 26, fontWeight: 700, color: c } }, String(props.n)),
      React.createElement("div", { style: { fontSize: 12, opacity: 0.6, marginTop: 2 } }, props.label)
    );
  }

  function TaskCenterPage() {
    const _s = useState(null);
    const data = _s[0];
    const setData = _s[1];
    const _e = useState(null);
    const error = _e[0];
    const setError = _e[1];
    const _l = useState(true);
    const loading = _l[0];
    const setLoading = _l[1];

    const load = useCallback(function () {
      fetchJSON(API + "/tasks")
        .then(function (d) {
          setData(d);
          setError(null);
        })
        .catch(function (e) {
          setError(String((e && e.message) || e));
        })
        .finally(function () {
          setLoading(false);
        });
    }, []);

    useEffect(function () {
      load();
      const t = setInterval(load, 5000);
      return function () {
        clearInterval(t);
      };
    }, [load]);

    if (loading && !data) {
      return React.createElement(
        "div",
        { style: { padding: 48, textAlign: "center", opacity: 0.6 } },
        "加载中…"
      );
    }
    if (error && !data) {
      return React.createElement(
        "div",
        { style: { padding: 48, textAlign: "center" } },
        React.createElement("div", { style: { color: "var(--ui-text-danger, #e5484d)", marginBottom: 12 } }, "加载失败：" + error),
        React.createElement(Button, { onClick: load }, "重试")
      );
    }

    const counts = (data && data.counts) || { active: 0, interrupted: 0, ended: 0 };

    return React.createElement(
      "div",
      { style: { padding: 24, maxWidth: 860, margin: "0 auto" } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 } },
        React.createElement("h2", { style: { margin: 0, fontSize: 20, fontWeight: 700 } }, "任务中心"),
        React.createElement(Button, { size: "sm", variant: "outline", onClick: load }, "刷新")
      ),
      error
        ? React.createElement(
            "div",
            { style: { fontSize: 12, color: "var(--ui-text-danger, #e5484d)", marginBottom: 10 } },
            error
          )
        : null,

      React.createElement(
        "div",
        { style: { display: "flex", gap: 12, marginBottom: 22 } },
        React.createElement(Stat, { label: "当前任务", n: counts.active, tone: "active" }),
        React.createElement(Stat, { label: "中断待营救", n: counts.interrupted, tone: "interrupted" }),
        React.createElement(Stat, { label: "已结束", n: counts.ended, tone: "ended" })
      ),

      React.createElement(Section, {
        title: "中断待营救",
        tone: "interrupted",
        items: data.interrupted,
        emptyText: "没有中断的任务，干得漂亮。",
      }),
      React.createElement(Section, {
        title: "当前任务",
        tone: "active",
        items: data.active,
        emptyText: "当前没有正在进行的任务。",
      }),
      React.createElement(Section, {
        title: "已结束",
        tone: "ended",
        items: data.ended,
        emptyText: "暂无已结束会话。",
      })
    );
  }

  window.__HERMES_PLUGINS__.register("task-center", TaskCenterPage);
})();
