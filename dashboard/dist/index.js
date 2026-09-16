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
  const fetchJSON = SDK.fetchJSON;

  const API = "/api/plugins/task-center";
  const PAGE_SIZE = 20;

  // --- i18n: English default, zh-CN when the browser language is Chinese ---
  const STR = {
    en: {
      taskCenter: "Task Center",
      refresh: "Refresh",
      retry: "Retry",
      loading: "Loading…",
      loadFailed: "Failed to load: ",
      rescue: "Rescue",
      open: "Open",
      delete: "Delete",
      confirmDelete: "Delete this session?",
      active: "Active",
      interrupted: "Interrupted",
      ended: "Ended",
      source: "source",
      reason: "reason",
      messages: "{n} messages",
      lastActive: "last active ",
      justNow: "just now",
      minAgo: "{n}m ago",
      hourAgo: "{n}h ago",
      dayAgo: "{n}d ago",
      prev: "Prev",
      next: "Next",
      emptyInterrupted: "No interrupted tasks. Nice.",
      emptyActive: "No active tasks.",
      emptyEnded: "No ended sessions.",
      r_ws_orphan_reap: "connection dropped",
      r_startup_orphan_reap: "process restarted",
      r_lru_evict: "memory reclaimed",
      r_cron_incomplete_no_output: "no output",
      r_idle_timeout: "idle timeout",
      r_session_reset: "session reset",
      r_cron_complete: "cron completed",
    },
    zh: {
      taskCenter: "任务中心",
      refresh: "刷新",
      retry: "重试",
      loading: "加载中…",
      loadFailed: "加载失败：",
      rescue: "营救",
      open: "进入",
      delete: "删除",
      confirmDelete: "确定删除这个会话？",
      active: "当前任务",
      interrupted: "中断待营救",
      ended: "已结束",
      source: "来源",
      reason: "原因",
      messages: "{n} 条消息",
      lastActive: "最后活跃 ",
      justNow: "刚刚",
      minAgo: "{n} 分钟前",
      hourAgo: "{n} 小时前",
      dayAgo: "{n} 天前",
      prev: "上一页",
      next: "下一页",
      emptyInterrupted: "没有中断的任务，干得漂亮。",
      emptyActive: "当前没有正在进行的任务。",
      emptyEnded: "暂无已结束会话。",
      r_ws_orphan_reap: "连接断开",
      r_startup_orphan_reap: "进程重启",
      r_lru_evict: "内存回收",
      r_cron_incomplete_no_output: "无输出中断",
      r_idle_timeout: "空闲超时",
      r_session_reset: "会话重置",
      r_cron_complete: "定时任务完成",
    },
  };

  function resolveLang(locale) {
    if (locale && typeof locale === "string" && locale.toLowerCase().indexOf("zh") === 0) {
      return "zh";
    }
    return "en";
  }
  // Resolved from the host's i18n context (SDK.useI18n) on every render, so a
  // language switch in the dashboard updates the plugin without a reload.
  let LANG = "en";

  function t(key, vars) {
    let s = (STR[LANG] && STR[LANG][key]) || STR.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace("{" + k + "}", vars[k]);
      });
    }
    return s;
  }

  function fmtTime(ts) {
    if (!ts) return "—";
    const s = Number(ts);
    if (!isFinite(s) || s <= 0) return "—";
    const diff = Math.floor(Date.now() / 1000 - s);
    if (diff < 60) return t("justNow");
    if (diff < 3600) return t("minAgo", { n: Math.floor(diff / 60) });
    if (diff < 86400) return t("hourAgo", { n: Math.floor(diff / 3600) });
    if (diff < 86400 * 7) return t("dayAgo", { n: Math.floor(diff / 86400) });
    const d = new Date(s * 1000);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return mm + "-" + dd;
  }

  function reasonLabel(r) {
    if (!r) return null;
    const s = t("r_" + r);
    return s && s !== "r_" + r ? s : r;
  }

  function SessionRow(props) {
    const s = props.s;
    const kind = props.kind;
    const meta = [
      s.source ? t("source") + " " + s.source : null,
      kind === "interrupted" && s.end_reason ? t("reason") + " " + reasonLabel(s.end_reason) : null,
      s.model ? s.model : null,
      s.message_count != null ? t("messages", { n: s.message_count }) : null,
      t("lastActive") + fmtTime(s.last_active),
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
      s.id
        ? React.createElement(
            "div",
            { style: { display: "flex", gap: 6, flexShrink: 0 } },
            React.createElement(
              Button,
              {
                size: "sm",
                variant: kind === "interrupted" ? undefined : "outline",
                onClick: function () {
                  window.location.href = "/chat?resume=" + encodeURIComponent(s.id);
                },
              },
              kind === "interrupted" ? t("rescue") : t("open")
            ),
            kind === "ended"
              ? React.createElement(
                  Button,
                  {
                    size: "sm",
                    variant: "destructive",
                    onClick: function () { props.onDelete && props.onDelete(s.id); },
                  },
                  t("delete")
                )
              : null
          )
        : null
    );
  }

  function TabBar(props) {
    const tabs = [
      ["interrupted", t("interrupted")],
      ["active", t("active")],
      ["ended", t("ended")],
    ];
    return React.createElement(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 16 } },
      tabs.map(function (pair) {
        const key = pair[0];
        const label = pair[1];
        const count = props.counts ? props.counts[key] || 0 : 0;
        const isActive = props.active === key;
        return React.createElement(
          "button",
          {
            key: key,
            onClick: function () { props.onSwitch(key); },
            style: {
              padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13,
              border: "1px solid " + (isActive
                ? "var(--ui-accent, #4c8dff)"
                : "var(--ui-stroke-secondary, rgba(128,128,128,0.18))"),
              background: isActive ? "var(--ui-accent, #4c8dff)" : "transparent",
              color: isActive ? "#fff" : "inherit",
              fontWeight: isActive ? 600 : 400,
            },
          },
          label + " (" + count + ")"
        );
      })
    );
  }

  function Pagination(props) {
    if (props.totalPages <= 1) return null;
    return React.createElement(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 14 } },
      React.createElement(Button, {
        size: "sm", variant: "outline",
        disabled: props.page <= 1,
        onClick: props.onPrev,
      }, t("prev")),
      React.createElement("span", { style: { fontSize: 13, opacity: 0.7 } },
        props.page + " / " + props.totalPages),
      React.createElement(Button, {
        size: "sm", variant: "outline",
        disabled: props.page >= props.totalPages,
        onClick: props.onNext,
      }, t("next"))
    );
  }

  function TaskCenterPage() {
    // Follow the host dashboard's language instead of the browser's.
    if (SDK.useI18n) {
      try {
        const i18n = SDK.useI18n();
        LANG = resolveLang(i18n && i18n.locale);
      } catch (e) {
        LANG = "en";
      }
    }
    const _s = useState(null);
    const data = _s[0];
    const setData = _s[1];
    const _e = useState(null);
    const error = _e[0];
    const setError = _e[1];
    const _l = useState(true);
    const loading = _l[0];
    const setLoading = _l[1];
    const _tab = useState("interrupted");
    const tab = _tab[0];
    const setTab = _tab[1];
    const _page = useState(1);
    const page = _page[0];
    const setPage = _page[1];

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
        t("loading")
      );
    }
    if (error && !data) {
      return React.createElement(
        "div",
        { style: { padding: 48, textAlign: "center" } },
        React.createElement("div", { style: { color: "var(--ui-text-danger, #e5484d)", marginBottom: 12 } }, t("loadFailed") + error),
        React.createElement(Button, { onClick: load }, t("retry"))
      );
    }

    const items = (data && data[tab]) || [];
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    function switchTab(k) {
      setTab(k);
      setPage(1);
    }

    function deleteSession(id) {
      if (!window.confirm(t("confirmDelete"))) return;
      fetchJSON("/api/sessions/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () { load(); })
        .catch(function (err) { alert(String(err && err.message ? err.message : err)); });
    }

    return React.createElement(
      "div",
      { style: { padding: 24, maxWidth: 860, margin: "0 auto" } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } },
        React.createElement("h2", { style: { margin: 0, fontSize: 20, fontWeight: 700 } }, t("taskCenter")),
        React.createElement(Button, { size: "sm", variant: "outline", onClick: load }, t("refresh"))
      ),
      error
        ? React.createElement(
            "div",
            { style: { fontSize: 12, color: "var(--ui-text-danger, #e5484d)", marginBottom: 10 } },
            error
          )
        : null,

      React.createElement(TabBar, {
        active: tab,
        counts: data && data.counts,
        onSwitch: switchTab,
      }),

      pageItems.length === 0
        ? React.createElement(
            "div",
            { style: { fontSize: 13, opacity: 0.5, padding: "16px 0" } },
            t("empty" + tab.charAt(0).toUpperCase() + tab.slice(1))
          )
        : pageItems.map(function (s) {
            return React.createElement(SessionRow, { key: s.id, s: s, kind: tab, onDelete: deleteSession });
          }),

      React.createElement(Pagination, {
        page: safePage,
        totalPages: totalPages,
        onPrev: function () { setPage(Math.max(1, safePage - 1)); },
        onNext: function () { setPage(Math.min(totalPages, safePage + 1)); },
      })
    );
  }

  window.__HERMES_PLUGINS__.register("task-center", TaskCenterPage);
})();
