/**
 * AdminAssetsPage — 1:1 port of legacy src/app/nexa-admin-portal/assets/page.jsx.
 * Market administration: full CRUD for tradable instruments.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, money } from "@/tradeon-client/lib/apiClient";
import { CATEGORY_LABELS } from "@/tradeon-client/lib/assetCatalog";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

const BLANK = {
  symbol: "",
  name: "",
  category: "CRYPTO",
  provider: "",
  feedSymbol: "",
  payoutRate: 85,
  digits: 2,
  sortOrder: 50000,
  isActive: true,
};

export default function AdminAssetsPage() {
  const [data, setData] = useState<any>({ assets: [], counts: {}, categories: [] });
  const [category, setCategory] = useState("ALL");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>(BLANK);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/admin/assets?category=${category}&q=${encodeURIComponent(q)}`);
      setData(d);
    } catch (err: any) {
      alert.critical(err.message, { title: "Markets unavailable" });
    }
  }, [category, q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useLiveEvents({
    scope: "admin",
    onEvent: (e: any) => {
      if (e.topic === "assets") load();
    },
  });

  const save = async () => {
    const payload = {
      name: form.name,
      category: form.category,
      provider: form.provider,
      feedSymbol: form.feedSymbol,
      payoutRate: Number(form.payoutRate),
      digits: Number(form.digits),
      sortOrder: Number(form.sortOrder),
      isActive: Boolean(form.isActive),
    };
    const symbol = creating ? String(form.symbol || "").toUpperCase() : editing.symbol;
    let message;
    if (creating) {
      message = `Create ${symbol || "this instrument"} at ${payload.payoutRate}% payout and publish it to every open terminal, live, immediately?`;
    } else {
      const diffs = [];
      if (Number(editing.payoutRate) !== payload.payoutRate)
        diffs.push(`payout ${editing.payoutRate}% → ${payload.payoutRate}%`);
      if (Boolean(editing.isActive) !== payload.isActive)
        diffs.push(payload.isActive ? "market goes LIVE" : "market goes OFF");
      if (editing.name !== payload.name) diffs.push(`name "${editing.name}" → "${payload.name}"`);
      if (
        (editing.provider || "") !== (payload.provider || "") ||
        (editing.feedSymbol || "") !== (payload.feedSymbol || "")
      )
        diffs.push("price feed changed");
      if (Number(editing.digits) !== payload.digits)
        diffs.push(`decimals ${editing.digits} → ${payload.digits}`);
      if (Number(editing.sortOrder) !== payload.sortOrder) diffs.push("sort order changed");
      if (editing.category !== payload.category)
        diffs.push(`category → ${(CATEGORY_LABELS as any)[payload.category] || payload.category}`);
      if (!diffs.length) {
        alert.info("No changes to publish.", { log: false });
        return;
      }
      message = `Change ${symbol}: ${diffs.join(", ")} — for ALL users, live, immediately?`;
    }
    const ok = await alert.confirm({
      severity: "warning",
      title: creating ? "Confirm new market" : `Confirm ${symbol} change`,
      message,
      confirmLabel: "Confirm & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;

    setBusy(true);
    try {
      if (creating) {
        await api("/api/admin/assets", { method: "POST", body: form });
        alert.success(`${symbol} created and live for every trader.`);
      } else {
        await api(`/api/admin/assets/${editing.symbol}`, { method: "PATCH", body: payload });
        alert.success(`${symbol} updated and live for all users.`);
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Market NOT saved" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (asset: any) => {
    const enabling = !asset.isActive;
    const ok = await alert.confirm({
      severity: "warning",
      title: enabling ? `Enable ${asset.symbol}?` : `Disable ${asset.symbol}?`,
      message: enabling
        ? `${asset.symbol} becomes visible and tradable for ALL users immediately.`
        : `${asset.symbol} disappears from every terminal immediately. Open positions still settle normally.`,
      confirmLabel: enabling ? "Enable & publish" : "Disable & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await api(`/api/admin/assets/${asset.symbol}`, {
        method: "PATCH",
        body: { isActive: enabling },
      });
      alert.success(`${asset.symbol} is now ${enabling ? "LIVE" : "OFF"} for all users.`);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Change NOT applied" });
    }
  };

  const remove = async (asset: any) => {
    const ok = await alert.confirm({
      severity: "critical",
      title: `Delete ${asset.symbol} permanently?`,
      message: "Traders will no longer see this market. This cannot be undone.",
      confirmLabel: "Delete market",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    try {
      await api(`/api/admin/assets/${asset.symbol}`, { method: "DELETE" });
      alert.success(`${asset.symbol} deleted.`);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Delete failed" });
    }
  };

  const total = useMemo(
    () => Object.values(data.counts || {}).reduce((a: number, b: any) => a + b, 0),
    [data.counts],
  );

  return (
    <div className="admin-assets">
      <PageHeader
        eyebrow="Instrument catalog"
        title="Markets &"
        highlight="Assets"
        subtitle="Tradable symbols, payout rates & categories"
      />

      <section className="glass assets-panel assets-head">
        <div>
          <h3>Market catalogue</h3>
          <p className="muted assets-small">
            {total} instruments installed · {data.assets.filter((a: any) => a.isActive).length}{" "}
            shown active in this view. Create, edit or remove anything — no hardcoded restrictions.
          </p>
        </div>
        <button
          className="btn btn-gold"
          onClick={() => {
            setForm(BLANK);
            setCreating(true);
            setEditing(null);
          }}
        >
          + Add instrument
        </button>
      </section>

      <section className="glass assets-panel">
        <div className="assets-filters">
          <input
            className="input"
            placeholder="Search symbol or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="assets-cats">
            {["ALL", ...(data.categories || [])].map((c) => (
              <button
                key={c}
                className={`assets-cat ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c === "ALL"
                  ? `All (${total})`
                  : `${(CATEGORY_LABELS as any)[c] || c} (${data.counts?.[c] || 0})`}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Category</th>
                <th>Feed</th>
                <th>Payout</th>
                <th>24h trades</th>
                <th>24h volume</th>
                <th>State</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((a: any) => (
                <tr key={a.symbol} className={a.isActive ? "" : "off"}>
                  <td className="mono">
                    <strong>{a.symbol}</strong>
                  </td>
                  <td>{a.name}</td>
                  <td>
                    <span className="badge">
                      {(CATEGORY_LABELS as any)[a.category] || a.category}
                    </span>
                  </td>
                  <td className="mono dim">
                    {a.provider}:{a.feedSymbol}
                  </td>
                  <td className="mono gold-text">{a.payoutRate}%</td>
                  <td className="mono">{a.trades ?? 0}</td>
                  <td className="mono">{money(a.volume ?? 0)}</td>
                  <td>
                    <span className={`badge ${a.isActive ? "badge-up" : "badge-down"}`}>
                      {a.isActive ? "LIVE" : "OFF"}
                    </span>
                  </td>
                  <td className="right nowrap">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setEditing(a);
                        setForm({ ...a });
                        setCreating(false);
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggle(a)}>
                      {a.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn btn-sm btn-ghost assets-danger"
                      onClick={() => remove(a)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!data.assets.length && (
                <tr>
                  <td colSpan={9} className="empty">
                    No instrument matches this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AnimatePresence>
        {(editing || creating) && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setEditing(null);
              setCreating(false);
            }}
          >
            <motion.div
              className="glass assets-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>{creating ? "New instrument" : `Edit ${editing.symbol}`}</h3>

              <div className="assets-grid2">
                {creating && (
                  <div className="field">
                    <label>Symbol (internal id)</label>
                    <input
                      className="input mono"
                      value={form.symbol}
                      placeholder="e.g. LINKUSDT"
                      onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                    />
                  </div>
                )}
                <div className="field">
                  <label>Display name</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Category</label>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {(data.categories || []).map((c: any) => (
                      <option key={c} value={c}>
                        {(CATEGORY_LABELS as any)[c] || c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Feed provider</label>
                  <select
                    className="input"
                    value={form.provider || ""}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  >
                    <option value="">Auto</option>
                    <option value="BINANCE">BINANCE (crypto websocket)</option>
                    <option value="FX">FX (Finnhub / Polygon / Yahoo)</option>
                    <option value="EQUITY">EQUITY (Finnhub / Yahoo)</option>
                    <option value="INDEX">INDEX (Yahoo)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Upstream symbol</label>
                  <input
                    className="input mono"
                    value={form.feedSymbol || ""}
                    placeholder="btcusdt / EURUSD / AAPL / ^GSPC"
                    onChange={(e) => setForm({ ...form, feedSymbol: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Payout rate (%)</label>
                  <input
                    className="input mono"
                    type="number"
                    min="10"
                    max="99"
                    value={form.payoutRate}
                    onChange={(e) => setForm({ ...form, payoutRate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Price decimals</label>
                  <input
                    className="input mono"
                    type="number"
                    min="0"
                    max="8"
                    value={form.digits}
                    onChange={(e) => setForm({ ...form, digits: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Sort order</label>
                  <input
                    className="input mono"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                </div>
              </div>

              <label className="assets-check">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>Visible & tradable for users</span>
              </label>

              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-gold btn-block" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "Save & broadcast"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(null);
                    setCreating(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
