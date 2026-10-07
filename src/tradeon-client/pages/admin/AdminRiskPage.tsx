/** Full Risk Engine port: legacy/public/js/views/admin.js → renderSettings().
 * Redesigned with 3D dynamic effects, glassmorphism and professional fintech styling.
 * React/Express transport only; legacy sections, copy, bounds and save behaviour.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/tradeon-client/lib/apiClient';
import { alert } from '@/tradeon-client/lib/useAlertStore';
import PageHeader from '@/tradeon-client/components/admin/PageHeader';
import { RiskSettingRow as Row, RiskSwitch } from '@/tradeon-client/components/admin/RiskSettingRow';
import '@/tradeon-client/styles/admin-risk.css';

const NUMERIC_FIELDS = [
  'global_probability_rate', 'circuit_breaker_factor', 'spread_percentage',
  'slippage_percentage', 'min_deposit_limit', 'min_withdrawal_limit',
  'referral_bonus', 'cashback_percentage', 'min_stake', 'max_stake',
];

export default function AdminRiskPage() {
  const [draft, setDraft] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/api/admin/settings')
    .then((d: any) => setDraft(d.settings))
    .catch((e: Error) => setMessage(e.message));
  useEffect(() => { load(); }, []);

  const save = async (body: Record<string, any>) => {
    setBusy(true);
    setMessage('');
    try {
      const d: any = await api('/api/admin/settings', { method: 'PATCH', body });
      setDraft((current: any) => ({ ...current,
        ...Object.fromEntries(Object.keys(body).map((key) => [key, d.settings[key]])),
      }));
      setMessage('Settings applied. Risk engine updated globally.');
      alert.success('Risk engine updated globally.', { title: 'Settings applied' });
    } catch (e: any) {
      setMessage(e.message);
      alert.critical(e.message, { title: 'Update failed' });
    } finally { setBusy(false); }
  };
  const change = (key: string, value: string) => setDraft((current: any) => ({ ...current, [key]: value }));
  const switchControl = (id: string, label: string, key: string) => <RiskSwitch
    id={id} label={label} checked={Boolean(draft[key])} disabled={busy}
    onChange={() => save({ [key]: !draft[key] })} />;
  const numberControl = (id: string, label: string, key: string, min: number, max?: number, step = 1) =>
    <input id={id} aria-label={label} className="input mono" type="number" min={min} max={max}
      step={step} required value={draft[key]} onChange={(e) => change(key, e.target.value)} />;

  const cardVariants = {
    hidden: { opacity: 0, y: 24, rotateX: -8 },
    visible: (i: number) => ({
      opacity: 1, y: 0, rotateX: 0,
      transition: { delay: i * 0.08, type: 'spring' as const, stiffness: 220, damping: 22 },
    }),
  };

  return <div className="admin-risk">
    <PageHeader eyebrow={null} right={null} title="Risk Management" highlight="Engine" subtitle="Global execution parameters, volatility protection and synthetic spread controls." />
    {message && <motion.p role="status" data-testid="risk-status" className="risk-status-msg"
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>{message}</motion.p>}
    {!draft ? <button className="btn" onClick={load}>Load settings</button> : <form onSubmit={(e) => {
      e.preventDefault();
      save(Object.fromEntries(NUMERIC_FIELDS.map((key) => [key, Number(draft[key])])));
    }}>
      <motion.section className="card card-pad risk-card-3d" aria-labelledby="risk-feed-title"
        custom={0} variants={cardVariants} initial="hidden" animate="visible"
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}>
        <div className="risk-card-glow" />
        <h3 className="card-title" id="risk-feed-title">
          <span className="risk-card-icon">📡</span> Market data feed
          <span className="risk-live-pill">LIVE</span>
        </h3>
        <Row title="Price data source" description="LIVE streams real market prices from keyless public APIs — Binance (crypto) and Yahoo Finance (forex/commodities, possibly delayed). If a provider is unreachable, that asset automatically falls back to the synthetic engine and is marked SIM in the terminal.">
          <div className="segmented" id="data-source-seg" role="group" aria-label="Price data source">
            {['LIVE', 'SYNTHETIC'].map((mode) => <button key={mode} type="button" data-ds={mode}
              aria-pressed={draft.market_data_source === mode} disabled={busy}
              className={draft.market_data_source === mode ? 'active' : ''}
              onClick={() => save({ market_data_source: mode })}>{mode}</button>)}
          </div>
        </Row>
      </motion.section>

      <motion.section className="card card-pad risk-card-3d" aria-labelledby="risk-execution-title"
        custom={1} variants={cardVariants} initial="hidden" animate="visible"
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}>
        <div className="risk-card-glow risk-glow-cyan" />
        <h3 className="card-title" id="risk-execution-title">
          <span className="risk-card-icon">⚙️</span> Execution
        </h3>
        <Row title="Execution mode" description="SIMULATION resolves outcomes via the probability coefficient. REAL_MARKET resolves strictly against live price movement (entry vs exit).">
          <div className="segmented" id="exec-mode" role="group" aria-label="Execution mode">
            {['SIMULATION', 'REAL_MARKET'].map((mode) => <button key={mode} type="button" data-em={mode}
              aria-pressed={draft.execution_mode === mode} disabled={busy}
              className={draft.execution_mode === mode ? 'active' : ''}
              onClick={() => save({ execution_mode: mode })}>{mode}</button>)}
          </div>
        </Row>
        <Row title="Target return rate — global win rate %" description="Baseline execution success threshold in SIMULATION mode. Users without a custom ratio win a trade with this probability.">
          <input type="range" id="set-prob" aria-label="Global win rate" min="0" max="95" step="1"
            value={draft.global_probability_rate} onChange={(e) => change('global_probability_rate', e.target.value)} />
          <span className="range-val" id="set-prob-v">{draft.global_probability_rate}%</span>
        </Row>
      </motion.section>

      <motion.section className="card card-pad risk-card-3d" aria-labelledby="risk-protection-title"
        custom={2} variants={cardVariants} initial="hidden" animate="visible"
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}>
        <div className="risk-card-glow risk-glow-amber" />
        <h3 className="card-title" id="risk-protection-title">
          <span className="risk-card-icon">🛡️</span> Volatility protection
        </h3>
        <Row title="Circuit breaker (global override)" description={<>When ON: new position expiries are auto-extended ×1.5 and the effective win probability is scaled by the factor below. Affected trades are flagged <span className="badge badge-gold">CB</span>.</>}>
          {switchControl('set-cb', 'Circuit breaker (global override)', 'enable_circuit_breaker')}
        </Row>
        <Row title="Circuit breaker factor" description="Multiplier applied to the win probability while the breaker is active (0.5 = probability halved).">
          <input type="range" id="set-cbf" aria-label="Circuit breaker factor" min="0.05" max="1" step="0.05"
            value={draft.circuit_breaker_factor} onChange={(e) => change('circuit_breaker_factor', e.target.value)} />
          <span className="range-val" id="set-cbf-v">{draft.circuit_breaker_factor}</span>
        </Row>
        <Row title="🚨 Emergency force-loss override" description="When ON, every SIMULATION-mode position expires as a LOSS — payouts suspended platform-wide (emergency de-risking). Does not alter REAL_MARKET resolution.">
          {switchControl('set-fl', 'Emergency force-loss override', 'force_loss_mode')}
        </Row>
      </motion.section>

      <motion.section className="card card-pad risk-card-3d" aria-labelledby="risk-pricing-title"
        custom={3} variants={cardVariants} initial="hidden" animate="visible"
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}>
        <div className="risk-card-glow risk-glow-violet" />
        <h3 className="card-title" id="risk-pricing-title">
          <span className="risk-card-icon">📊</span> Synthetic pricing layer
        </h3>
        <Row title="Spread adjuster" description="Half-spread offset (%) applied against the trader at entry (CALL buys above mid, PUT sells below mid).">
          {numberControl('set-spread', 'Spread adjuster', 'spread_percentage', 0, 1, 0.01)}<span className="range-val">%</span>
        </Row>
        <Row title="Slippage adjuster" description="Random entry/exit jitter (%) layered on top of the spread during the execution window.">
          {numberControl('set-slip', 'Slippage adjuster', 'slippage_percentage', 0, 1, 0.01)}<span className="range-val">%</span>
        </Row>
      </motion.section>

      <motion.section className="card card-pad risk-card-3d" aria-labelledby="risk-limits-title"
        custom={4} variants={cardVariants} initial="hidden" animate="visible"
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}>
        <div className="risk-card-glow risk-glow-green" />
        <h3 className="card-title" id="risk-limits-title">
          <span className="risk-card-icon">🏦</span> Limits & platform
        </h3>
        <Row title="Minimum deposit">{numberControl('set-mindep', 'Minimum deposit', 'min_deposit_limit', 1, 10000)}</Row>
        <Row title="Minimum withdrawal">{numberControl('set-minwd', 'Minimum withdrawal', 'min_withdrawal_limit', 1, 10000)}</Row>
        <Row title="Minimum stake">{numberControl('min-stake', 'Minimum stake', 'min_stake', 1)}</Row>
        <Row title="Maximum stake">{numberControl('max-stake', 'Maximum stake', 'max_stake', Number(draft.min_stake))}</Row>
        <Row title="Referral bonus per signup ($)" description="Practice-fund bonus credited to the inviter when a new user registers with their code.">
          {numberControl('set-refbonus', 'Referral bonus per signup', 'referral_bonus', 0, 1000, 0.5)}
        </Row>
        <Row title="Loss cashback (%)" description="Automatic refund of this % of the stake on every losing position (0 = off).">
          {numberControl('set-cashback', 'Loss cashback', 'cashback_percentage', 0, 50, 0.5)}<span className="range-val">%</span>
        </Row>
        <Row title="Maintenance mode" description="Blocks all non-admin API activity platform-wide.">
          {switchControl('set-maint', 'Maintenance mode', 'maintenance_mode')}
        </Row>
        <div className="save-row"><button id="set-save" className="btn btn-primary risk-save-btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save all settings'}
        </button></div>
      </motion.section>
    </form>}
  </div>;
}
