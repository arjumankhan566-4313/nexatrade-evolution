// @ts-nocheck
/** Verbatim legacy OTC UI; scoped CSS and request transport adapted only. */

import { useState } from 'react';
import { useAdminOtcConsole } from '@/tradeon-client/hooks/useAdminOtcConsole';
import OtcInstrumentIcon from '@/tradeon-client/components/admin/OtcInstrumentIcon';
import { motion, AnimatePresence } from 'framer-motion';

import { api } from '@/tradeon-client/lib/apiClient';
import { alert } from '@/tradeon-client/lib/useAlertStore';
import '@/styles/admin.css';

const SESSION_OPTIONS = ['OPEN', 'PAUSED', 'MAINTENANCE'];
const TRADING_OPTIONS = ['ENABLED', 'DISABLED'];
const ENGINE_OPTIONS = ['RUNNING', 'PAUSED', 'STOPPED', 'UNHEALTHY', 'RECOVERING'];

const field = (label, children) => (
  <div className="field" style={{ marginBottom: 10 }}>
    <label style={{ fontWeight: 600 }}>{label}</label>
    {children}
  </div>
);

function Badge({ text, variant }) {
  const cls =
    variant === 'live' ? 'nt-pill is-live'
      : variant === 'paused' ? 'nt-pill is-warning'
      : variant === 'disabled' ? 'nt-pill is-danger'
      : 'nt-pill is-ghost';
  return <span className={cls}>{text}</span>;
}

function StatusPill({ status }) {
  let variant = 'ghost';
  if (status === 'LIVE') variant = 'live';
  else if (status === 'PAUSED') variant = 'paused';
  else if (status === 'DISABLED' || status === 'MAINTENANCE') variant = 'disabled';
  return <Badge text={status} variant={variant} />;
}

function Spinner({ size = 18, className = 'otc-spin' }) {
  return <span className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span>;
}

function X({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }

export default function OtcAdminPage() {
  const { loading, data, error, load } = useAdminOtcConsole();
  const [selected, setSelected] = useState(null);
  const [openModal, setOpenModal] = useState(null); // 'edit' | 'new' | 'config' | 'events' | 'control'
  const [saving, setSaving] = useState(false);
  const [eventsFilter, setEventsFilter] = useState({ symbol: '', kind: '' });
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const openSheet = (type, symbol) => {
    setSelected(symbol);
    setOpenModal(type);
  };
  const closeSheet = () => { setOpenModal(null); setSelected(null); };

  const saveInstrument = async (values, mode) => {
    setSaving(true);
    try {
      if (mode === 'new') {
        await api('/api/admin/otc/instruments', { method: 'POST', body: values });
        alert.success('OTC market created.');
      } else {
        await api('/api/admin/otc/instruments', { method: 'PATCH', body: { symbol: selected, display_name: values.displayName, digits: values.digits, tick_interval_ms: values.tickIntervalMs, volatility: values.volatility, spread: values.spread, payout_rate: values.payoutRate, min_stake: values.minStake, max_stake: values.maxStake, exposure_limit: values.exposureLimit, retention_days: values.retentionDays, starting_price: values.startingPrice, sort_order: values.sortOrder, session_status: values.sessionStatus, trading_status: values.tradingStatus, engine_status: values.engineStatus } });
        alert.success('OTC market updated.');
      }
      closeSheet();
      load();
    } catch (err) {
      alert.critical(err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async (patch) => {
    setSaving(true);
    try {
      await api('/api/admin/otc/config', { method: 'PATCH', body: patch });
      alert.success('Engine config applied.');
      load();
    } catch (err) {
      alert.critical(err?.message || 'Config save failed.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action, symbol) => {
    setSaving(true);
    try {
      await api('/api/admin/otc/control', { method: 'POST', body: { action, symbol } });
      alert.success(`OTC action ${action} applied.`);
      closeSheet();
      load();
    } catch (err) {
      alert.critical(err?.message || 'Action failed.');
    } finally {
      setSaving(false);
    }
  };

  const engine = data?.engine;
  const instruments = data?.instruments || [];
  const config = data?.config || {};
  const categories = data?.categories || {};
  const events = data?.events || [];

  const CATEGORY_LABELS: Record<string, string> = {
    CRYPTO: 'Crypto', STOCK: 'Stocks', FOREX: 'Currency', COMMODITY: 'Commodities', INDEX: 'Indices', OTC: 'Other',
  };
  const categoryEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const visibleInstruments = categoryFilter === 'ALL'
    ? instruments
    : instruments.filter((i) => i.category === categoryFilter);

  const filteredEvents = events
    .slice()
    .filter((e) => !eventsFilter.symbol || e.symbol === eventsFilter.symbol)
    .filter((e) => !eventsFilter.kind || e.kind === eventsFilter.kind)
    .slice(0, 80);

  const currencyOpts = [
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'JPY', label: 'JPY' },
    { value: 'CHF', label: 'CHF' },
    { value: 'CAD', label: 'CAD' },
    { value: 'AUD', label: 'AUD' },
  ];

  return (
    <div className="otc-page" data-server-time={data?.serverTime}>
      {error && data && <div className="alert alert-error" role="status">{error}</div>}
      <div className="otc-status-strip">
        <Badge text={engine?.running ? 'ENGINE LIVE' : 'ENGINE STOPPED'} variant={engine?.running ? 'live' : 'disabled'} />
        {engine?.running && <span className="otc-running-hint">Engine is actively generating synthetic prices</span>}
      </div>

      <motion.div
        className="grid-3"
        style={{ marginTop: 18 }}
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
      >
        {/* Engine summary */}
        <motion.section
          className="otc-card otc-card-flex"
          data-accent="status"
          variants={{ hidden: { opacity: 0, y: 24, rotateX: -8 }, show: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } } }}
        >
          <h3><span className="otc-h3bar" />Engine Status{engine?.running && <span className="otc-live-dot" />}</h3>
          <div className="otc-metrics otc-metrics-fill">
            {engine && (
              <>
                <div className="otc-metric"><span className="otc-metric-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span><div><span>Leader</span><b>{engine.leaderId || '—'}</b></div></div>
                <div className="otc-metric"><span className="otc-metric-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v2m0 14v2M5 6h2m12 0h2M5 18h2m12 0h2"/></svg></span><div><span>Mode</span><b>{engine.leaderMode || '—'}</b></div></div>
                <div className="otc-metric"><span className="otc-metric-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span><div><span>Uptime</span><b>{engine?.uptimeMs ? `${(engine.uptimeMs / 1000).toFixed(1)}s` : '—'}</b></div></div>
                <div className="otc-metric"><span className="otc-metric-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg></span><div><span>Subscribers</span><b>{engine?.subscribers ?? '—'}</b></div></div>
                <div className="otc-metric otc-metric-wide"><span className="otc-metric-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><div><span>Queue depth</span><b>{engine?.queueDepth ?? '—'}</b></div></div>
              </>
            )}
            {!engine && <p className="muted">Engine not started yet.</p>}
          </div>
          {engine?.running && (
            <div className="otc-engine-pulse">
              <span className="otc-pulse-dot" />
              <span className="otc-pulse-text">ENGINE ACTIVE — generating synthetic ticks</span>
            </div>
          )}
          <div className="otc-actions">
            {engine?.running ? (
              <button className="btn" onClick={() => runAction('STOP', 'OTCEngine')} disabled={saving}>
                {saving ? <><Spinner size={14} /> Stopping…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop Engine</>}
              </button>
            ) : (
              <button className="btn gold" onClick={() => runAction('START', 'OTCEngine')} disabled={saving}>
                {saving ? <><Spinner size={14} /> Starting…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Engine</>}
              </button>
            )}
          </div>
        </motion.section>

        {/* Engine config */}
        <motion.section
          className="otc-card otc-card-flex"
          data-accent="config"
          variants={{ hidden: { opacity: 0, y: 24, rotateX: -8 }, show: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } } }}
        >
          <h3><span className="otc-h3bar" />Engine Configuration{config.engine_enabled !== false && <span className="otc-live-dot" />}</h3>
          <div className="otc-config-live-bar">
            <span className="otc-pulse-dot" />
            <span>CONFIG LIVE — engine-wide tuning applies in real time</span>
          </div>
          <ul className="otc-config-list otc-config-list-fill">
            <li><span>Engine enabled</span><b className={config.engine_enabled !== false ? 'otc-val-on' : 'otc-val-off'}>{String(config.engine_enabled !== false).toUpperCase()}</b></li>
            <li><span>Gap policy</span><b>{config.gap_policy || 'RESUME_WITH_GAP'}</b></li>
            <li><span>Auto recover</span><b className={config.auto_recover !== false ? 'otc-val-on' : 'otc-val-off'}>{String(config.auto_recover !== false).toUpperCase()}</b></li>
            <li><span>Tick retention</span><b>{config.tick_retention_days ?? '—'} days</b></li>
            <li><span>Checkpoint interval</span><b>{config.checkpoint_interval_ms ?? '—'} ms</b></li>
            <li><span>Replay buffer</span><b>{config.replay_buffer_size ?? '—'} ticks</b></li>
            <li><span>Batch flush</span><b>{config.batch_flush_ms ?? '—'} ms</b></li>
          </ul>
          <div className="otc-actions">
            <button className="btn" onClick={() => openSheet('config')} disabled={saving}>
              {saving ? <><Spinner size={14} /> Editing…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> Edit Config</>}
            </button>
            <button className="btn ghost" onClick={() => openSheet('events')}>Audit Trail</button>
          </div>
        </motion.section>

        {/* Market counts */}
        <motion.section
          className="otc-card"
          data-accent="count"
          variants={{ hidden: { opacity: 0, y: 24, rotateX: -8 }, show: { opacity: 1, y: 0, rotateX: 0, transition: { type: 'spring', damping: 16 } } }}
        >
          <h3><span className="otc-h3bar" />Market Count</h3>
          <div className="otc-counts">
            <div className="otc-count"><span className="otc-count-big">{instruments.length}</span><span>OTC instruments</span></div>
            <div className="otc-count"><span className="otc-count-big">{instruments.filter((i) => i.isActive).length}</span><span>Active</span></div>
            <div className="otc-count"><span className="otc-count-big">{instruments.filter((i) => i.tradingStatus === 'ENABLED' && i.sessionStatus === 'OPEN').length}</span><span>Tradeable</span></div>
          </div>
          {categoryEntries.length > 0 && (
            <div className="otc-cat-breakdown">
              {categoryEntries.map(([cat, count]) => (
                <div key={cat} className="otc-cat-chip" onClick={() => setCategoryFilter(cat)}>
                  <span className="otc-cat-dot" data-cat={cat} />
                  <span>{CATEGORY_LABELS[cat] || cat}</span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
          )}
          <div className="otc-actions">
            <button className="btn gold" onClick={() => openSheet('new')} disabled={saving}>
              {saving ? <><Spinner size={14} /> Creating…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> New Market</>}
            </button>
          </div>
        </motion.section>
      </motion.div>

      {/* Instruments table */}
      <section className="otc-card stack" style={{ marginTop: 18 }}>
        <div className="otc-table-head">
          <h3>OTC Instruments</h3>
          <div className="otc-actions">
            <button className="btn" onClick={() => openSheet('edit', selected || visibleInstruments[0]?.symbol)} disabled={saving}>
              {saving ? <><Spinner size={14} /> Saving…</> : selected ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> {selected}</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Select</>}
            </button>
            <button className="btn ghost" onClick={() => openSheet('control', selected || visibleInstruments[0]?.symbol)} disabled={saving}>
              Control
            </button>
          </div>
        </div>

        <div className="otc-cat-tabs">
          <button className={categoryFilter === 'ALL' ? 'active' : ''} onClick={() => setCategoryFilter('ALL')}>
            All <b>{instruments.length}</b>
          </button>
          {categoryEntries.map(([cat, count]) => (
            <button key={cat} className={categoryFilter === cat ? 'active' : ''} onClick={() => setCategoryFilter(cat)}>
              {CATEGORY_LABELS[cat] || cat} <b>{count}</b>
            </button>
          ))}
        </div>

        {loading && !data ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><Spinner size={20} /> <span className="muted">Loading instruments…</span></div>
        ) : error && !data ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}><span className="muted" style={{ color: '#ff9aa0' }}>{error}</span></div>
        ) : (
          <div className="otc-table-wrap">
            <table className="otc-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Symbol</th>
                  <th>Category</th>
                  <th>Base / Quote</th>
                  <th>Digits</th>
                  <th>Payout</th>
                  <th>Tick / ms</th>
                  <th>Session</th>
                  <th>Trading</th>
                  <th>Engine</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {visibleInstruments.map((row, index) => (
                  <tr
                    key={row.symbol}
                    className={selected === row.symbol ? 'selected' : ''}
                    onClick={() => setSelected(row.symbol)}
                  >
                    <td className="otc-icon-cell">
                      <OtcInstrumentIcon icon={row.icon} base={row.base} symbol={row.symbol} category={row.category} loading={index < 12 ? 'eager' : 'lazy'} />
                    </td>
                    <td className="mono"><strong>{row.symbol}</strong></td>
                    <td><span className="otc-cat-badge" data-cat={row.category}>{CATEGORY_LABELS[row.category] || row.category}</span></td>
                    <td className="muted">{String(row.base).toUpperCase()} / {String(row.quote).toUpperCase()}</td>
                    <td>{row.digits}</td>
                    <td className="mono gold-text">{row.payoutRate}%</td>
                    <td className="mono">{row.tickIntervalMs}</td>
                    <td><StatusPill status={row.sessionStatus} /></td>
                    <td><StatusPill status={row.tradingStatus} /></td>
                    <td><StatusPill status={row.engineStatus} /></td>
                    <td><Badge text={row.isActive ? 'ON' : 'OFF'} variant={row.isActive ? 'live' : 'disabled'} /></td>
                  </tr>
                ))}
                {!visibleInstruments.length && (
                  <tr>
                    <td colSpan={11} className="empty">No OTC instruments in this category. Create one or seed the catalogue.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {instruments.length > 0 && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Click a row to edit or control it. All OTC markets are synthetic and run 24/7 — they never reference a real exchange price.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Sheets */}
      <AnimatePresence>
        {openModal === 'new' && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
          >
            <motion.div
              className="otc-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>New OTC Market</h3>
              <NewForm
                currencies={currencyOpts}
                onSave={(values) => saveInstrument(values, 'new')}
                saving={saving}
                onCancel={closeSheet}
              />
            </motion.div>
          </motion.div>
        )}

        {openModal === 'edit' && selected && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
          >
            <motion.div
              className="otc-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Edit {selected}</h3>
              <EditForm
                symbol={selected}
                currencyOpts={currencyOpts}
                initial={instruments.find((i) => i.symbol === selected) || {}}
                onSave={(values) => saveInstrument(values, 'edit')}
                saving={saving}
                onCancel={closeSheet}
              />
            </motion.div>
          </motion.div>
        )}

        {openModal === 'config' && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
          >
            <motion.div
              className="otc-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Engine Configuration</h3>
              <ConfigForm
                config={config}
                onSave={saveConfig}
                saving={saving}
                onCancel={closeSheet}
              />
            </motion.div>
          </motion.div>
        )}

        {openModal === 'events' && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
          >
            <motion.div
              className="otc-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Audit Trail</h3>
              <EventsPanel
                events={filteredEvents}
                filter={eventsFilter}
                onChange={setEventsFilter}
                onClose={closeSheet}
              />
            </motion.div>
          </motion.div>
        )}

        {openModal === 'control' && selected && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
          >
            <motion.div
              className="otc-modal"
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Instrument Control — {selected}</h3>
              <ControlPanel
                symbol={selected}
                row={instruments.find((i) => i.symbol === selected) || {}}
                onAction={runAction}
                saving={saving}
                onCancel={closeSheet}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}

function NewForm({ currencies, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    symbol: '',
    displayName: '',
    base: 'USD',
    quote: 'USD',
    digits: 2,
    tickIntervalMs: 1000,
    volatility: 0.00005,
    spread: 0.00004,
    payoutRate: 85,
    minStake: 1,
    maxStake: 10000,
    exposureLimit: 0,
    retentionDays: 14,
    startingPrice: 1,
    sortOrder: 60000,
    sessionStatus: 'OPEN',
    tradingStatus: 'ENABLED',
    engineStatus: 'RUNNING',
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {field('Symbol', <input className="input mono" value={form.symbol} placeholder="EURUSD-OTC" onChange={(e) => set('symbol', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} style={{ width: '100%' }} disabled={saving} />)}
        {field('Display name', <input className="input" value={form.displayName} placeholder="EUR / USD OTC" onChange={(e) => set('displayName', e.target.value)} style={{ width: '100%' }} disabled={saving} />)}
        {field('Base asset', <select className="input" value={form.base} onChange={(e) => set('base', e.target.value)} disabled={saving}>{currencies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
        {field('Quote asset', <select className="input" value={form.quote} onChange={(e) => set('quote', e.target.value)} disabled={saving}>{currencies.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
        {field('Digits', <input className="input mono" type="number" value={form.digits} onChange={(e) => set('digits', e.target.valueAsNumber)} min={0} max={8} disabled={saving} />)}
        {field('Starting price', <input className="input mono" type="number" value={form.startingPrice} onChange={(e) => set('startingPrice', e.target.valueAsNumber)} min={0.00001} step={0.00001} disabled={saving} />)}
        {field('Tick interval (ms)', <input className="input mono" type="number" value={form.tickIntervalMs} onChange={(e) => set('tickIntervalMs', e.target.valueAsNumber)} min={250} max={60000} disabled={saving} />)}
        {field('Volatility', <input className="input mono" type="number" value={form.volatility} onChange={(e) => set('volatility', e.target.valueAsNumber)} min={0.000001} max={0.05} step={0.000001} disabled={saving} />)}
        {field('Spread', <input className="input mono" type="number" value={form.spread} onChange={(e) => set('spread', e.target.valueAsNumber)} min={0} max={0.05} step={0.000001} disabled={saving} />)}
        {field('Payout %', <input className="input mono" type="number" value={form.payoutRate} onChange={(e) => set('payoutRate', e.target.valueAsNumber)} min={10} max={99} disabled={saving} />)}
        {field('Min stake', <input className="input mono" type="number" value={form.minStake} onChange={(e) => set('minStake', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Max stake', <input className="input mono" type="number" value={form.maxStake} onChange={(e) => set('maxStake', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Exposure limit', <input className="input mono" type="number" value={form.exposureLimit} onChange={(e) => set('exposureLimit', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Retention days', <input className="input mono" type="number" value={form.retentionDays} onChange={(e) => set('retentionDays', e.target.valueAsNumber)} min={1} max={365} disabled={saving} />)}
        {field('Sort order', <input className="input mono" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Session status', <select className="input" value={form.sessionStatus} onChange={(e) => set('sessionStatus', e.target.value)} disabled={saving}>{SESSION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
        {field('Trading status', <select className="input" value={form.tradingStatus} onChange={(e) => set('tradingStatus', e.target.value)} disabled={saving}>{TRADING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
        {field('Engine status', <select className="input" value={form.engineStatus} onChange={(e) => set('engineStatus', e.target.value)} disabled={saving}>{ENGINE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
      </div>
      <div className="note" style={{ margin: '14px 0', fontSize: 12.5, color: 'var(--muted)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        The symbol must end with <code>-OTC</code>. This is a synthetic market, not a real exchange feed.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn gold" onClick={() => onSave(form)} disabled={saving || !form.symbol.endsWith('-OTC')}>
          {saving ? <><Spinner size={14} /> Creating…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Create Market</>}
        </button>
      </div>
    </div>
  );
}

function EditForm({ symbol, currencyOpts, initial = {}, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    displayName: initial.displayName || initial.display_name || symbol,
    base: initial.base || symbol.replace('-OTC', '').slice(0, 6),
    quote: initial.quote || 'USD',
    digits: initial.digits ?? initial.decimal_precision ?? 2,
    tickIntervalMs: initial.tickIntervalMs ?? 1000,
    volatility: initial.volatility ?? 0.00005,
    spread: initial.spread ?? 0.00004,
    payoutRate: initial.payoutRate ?? initial.payout_percentage ?? 85,
    minStake: initial.minStake ?? initial.min_stake ?? 1,
    maxStake: initial.maxStake ?? initial.max_stake ?? 10000,
    exposureLimit: initial.exposureLimit ?? initial.exposure_limit ?? 0,
    retentionDays: initial.retentionDays ?? initial.retention_days ?? 14,
    startingPrice: initial.startingPrice ?? initial.starting_price ?? 1,
    sortOrder: initial.sortOrder ?? initial.sort_order ?? 50000,
    sessionStatus: initial.sessionStatus ?? initial.session_status ?? 'OPEN',
    tradingStatus: initial.tradingStatus ?? initial.trading_status ?? 'ENABLED',
    engineStatus: initial.engineStatus ?? initial.price_engine_status ?? 'RUNNING',
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {field('Display name', <input className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} style={{ width: '100%' }} disabled={saving} />)}
        {field('Base asset', <select className="input" value={form.base} onChange={(e) => set('base', e.target.value)} disabled={saving}>{currencyOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
        {field('Quote asset', <select className="input" value={form.quote} onChange={(e) => set('quote', e.target.value)} disabled={saving}>{currencyOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
        {field('Digits', <input className="input mono" type="number" value={form.digits} onChange={(e) => set('digits', e.target.valueAsNumber)} min={0} max={8} disabled={saving} />)}
        {field('Starting price', <input className="input mono" type="number" value={form.startingPrice} onChange={(e) => set('startingPrice', e.target.valueAsNumber)} min={0.00001} step={0.00001} disabled={saving} />)}
        {field('Tick interval (ms)', <input className="input mono" type="number" value={form.tickIntervalMs} onChange={(e) => set('tickIntervalMs', e.target.valueAsNumber)} min={250} max={60000} disabled={saving} />)}
        {field('Volatility', <input className="input mono" type="number" value={form.volatility} onChange={(e) => set('volatility', e.target.valueAsNumber)} min={0.000001} max={0.05} step={0.000001} disabled={saving} />)}
        {field('Spread', <input className="input mono" type="number" value={form.spread} onChange={(e) => set('spread', e.target.valueAsNumber)} min={0} max={0.05} step={0.000001} disabled={saving} />)}
        {field('Payout %', <input className="input mono" type="number" value={form.payoutRate} onChange={(e) => set('payoutRate', e.target.valueAsNumber)} min={10} max={99} disabled={saving} />)}
        {field('Min stake', <input className="input mono" type="number" value={form.minStake} onChange={(e) => set('minStake', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Max stake', <input className="input mono" type="number" value={form.maxStake} onChange={(e) => set('maxStake', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Exposure limit', <input className="input mono" type="number" value={form.exposureLimit} onChange={(e) => set('exposureLimit', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Retention days', <input className="input mono" type="number" value={form.retentionDays} onChange={(e) => set('retentionDays', e.target.valueAsNumber)} min={1} max={365} disabled={saving} />)}
        {field('Sort order', <input className="input mono" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.valueAsNumber)} min={0} disabled={saving} />)}
        {field('Session status', <select className="input" value={form.sessionStatus} onChange={(e) => set('sessionStatus', e.target.value)} disabled={saving}>{SESSION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
        {field('Trading status', <select className="input" value={form.tradingStatus} onChange={(e) => set('tradingStatus', e.target.value)} disabled={saving}>{TRADING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
        {field('Engine status', <select className="input" value={form.engineStatus} onChange={(e) => set('engineStatus', e.target.value)} disabled={saving}>{ENGINE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
      </div>
      <div className="note" style={{ margin: '14px 0', fontSize: 12.5, color: 'var(--muted)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        Synthetic OTC market — not a real exchange feed. Changes apply live to the engine.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn gold" onClick={() => onSave(form)} disabled={saving}>
          {saving ? <><Spinner size={14} /> Saving…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Save Instrument</>}
        </button>
      </div>
    </div>
  );
}

function ConfigForm({ config = {}, onSave, saving, onCancel }) {
  const [form, setForm] = useState({
    engine_enabled: config.engine_enabled !== false,
    gap_policy: config.gap_policy || 'RESUME_WITH_GAP',
    auto_recover: config.auto_recover !== false,
    tick_retention_days: config.tick_retention_days ?? 14,
    checkpoint_interval_ms: config.checkpoint_interval_ms ?? 5000,
    replay_buffer_size: config.replay_buffer_size ?? 5000,
    batch_flush_ms: config.batch_flush_ms ?? 250,
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const patch = {};
  if (form.engine_enabled !== config.engine_enabled) patch.engine_enabled = form.engine_enabled;
  if (form.auto_recover !== config.auto_recover) patch.auto_recover = form.auto_recover;
  if (form.gap_policy !== config.gap_policy) patch.gap_policy = form.gap_policy;
  if (form.tick_retention_days !== config.tick_retention_days) patch.tick_retention_days = form.tick_retention_days;
  if (form.checkpoint_interval_ms !== config.checkpoint_interval_ms) patch.checkpoint_interval_ms = form.checkpoint_interval_ms;
  if (form.replay_buffer_size !== config.replay_buffer_size) patch.replay_buffer_size = form.replay_buffer_size;
  if (form.batch_flush_ms !== config.batch_flush_ms) patch.batch_flush_ms = form.batch_flush_ms;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {field('Engine enabled', <input type="checkbox" checked={form.engine_enabled} onChange={(e) => set('engine_enabled', e.target.checked)} disabled={saving} style={{ transform: 'scale(1.15)' }} />)}
        {field('Gap policy', <select className="input" value={form.gap_policy} onChange={(e) => set('gap_policy', e.target.value)} disabled={saving}><option value="RESUME_WITH_GAP">Resume with gap</option><option value="SKIP_GAP">Skip gap</option></select>)}
        {field('Auto recover', <input type="checkbox" checked={form.auto_recover} onChange={(e) => set('auto_recover', e.target.checked)} disabled={saving} style={{ transform: 'scale(1.15)' }} />)}
        {field('Tick retention (days)', <input className="input mono" type="number" value={form.tick_retention_days} onChange={(e) => set('tick_retention_days', e.target.valueAsNumber)} min={1} max={365} disabled={saving} />)}
        {field('Checkpoint interval (ms)', <input className="input mono" type="number" value={form.checkpoint_interval_ms} onChange={(e) => set('checkpoint_interval_ms', e.target.valueAsNumber)} min={1000} max={600000} disabled={saving} />)}
        {field('Replay buffer (ticks)', <input className="input mono" type="number" value={form.replay_buffer_size} onChange={(e) => set('replay_buffer_size', e.target.valueAsNumber)} min={100} max={100000} disabled={saving} />)}
        {field('Batch flush (ms)', <input className="input mono" type="number" value={form.batch_flush_ms} onChange={(e) => set('batch_flush_ms', e.target.valueAsNumber)} min={50} max={10000} disabled={saving} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn gold" onClick={() => onSave(patch)} disabled={saving}>
          {saving ? <><Spinner size={14} /> Saving…</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Apply Configuration</>}
        </button>
      </div>
    </div>
  );
}

function ControlPanel({ symbol, row = {}, onAction, saving, onCancel }) {
  const actions = [
    { action: 'RESUME', label: 'Resume', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"/>, clause: row.sessionStatus !== 'OPEN' || row.tradingStatus !== 'ENABLED' },
    { action: 'PAUSE', label: 'Pause', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"/>, clause: row.sessionStatus !== 'PAUSED' },
    { action: 'STOP', label: 'Stop', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"/>, clause: row.tradingStatus !== 'DISABLED' || row.sessionStatus !== 'MAINTENANCE' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {field('Symbol', <input className="input mono" value={symbol} disabled style={{ width: '100%' }} />)}
        {field('Current session', <input className="input mono" value={row.sessionStatus || '—'} disabled style={{ width: '100%' }} />)}
        {field('Current trading', <input className="input mono" value={row.tradingStatus || '—'} disabled style={{ width: '100%' }} />)}
        {field('Engine status', <input className="input mono" value={row.engineStatus || '—'} disabled style={{ width: '100%' }} />)}
      </div>
      <div className="otc-control-actions">
        {actions.map(({ action, label, icon, clause }) => (
          <button
            key={action}
            className={`btn ${clause ? 'gold' : 'ghost'}`}
            disabled={saving || !clause}
            onClick={() => onAction(action, symbol)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" />
            {label}
          </button>
        ))}
      </div>
      <div className="note" style={{ margin: '14px 0', fontSize: 12.5, color: 'var(--muted)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        Pausing or stopping an OTC instrument stops new trades on that symbol. Real market feeds are not affected.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function EventsPanel({ events = [], filter, onChange, onClose }) {
  const kinds = [...new Set(events.map((e) => e.kind).filter(Boolean))].sort();

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <input className="input" placeholder="Filter by symbol…" value={filter.symbol} onChange={(e) => onChange({ ...filter, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} />
        <select className="input" value={filter.kind} onChange={(e) => onChange({ ...filter, kind: e.target.value })}>
          <option value="">All kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {events.length === 0 ? (
        <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No OTC events yet.</div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--stroke)', borderRadius: 8 }}>
          {events.map((ev) => (
            <div key={`${ev.id || ev.createdAt}-${ev.symbol}-${ev.kind}`} className="otc-event-row">
              <span className={`otc-event-sev ${ev.severity}`}>{ev.severity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span className="event-kind">{ev.kind}</span>
                  {ev.symbol && <span className="event-sym">{ev.symbol}</span>}
                  <span className="event-time muted">{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString() : '—'}</span>
                </div>
                <pre className="event-detail" style={{ background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 6, margin: 0, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {ev.detail ? JSON.stringify(ev.detail, null, 1) : (ev.oldValue || ev.newValue) ? `${ev.oldValue || ''}${ev.newValue ? ' → ' : ''}${ev.newValue || ''}` : ev.kind}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>


    </div>
  );
}
