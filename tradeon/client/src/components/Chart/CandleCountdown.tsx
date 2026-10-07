/**
 * CandleCountdown — ported 1:1 from legacy src/components/dashboard/CandleCountdown.jsx.
 * Shows time remaining until the current candle bucket boundary, e.g. "00:47".
 * At zero the old candle finalizes and a new one starts; the timer resets.
 */
import { useEffect, useState } from 'react';

interface Props {
  /** Candle bucket size in milliseconds */
  bucketMs: number;
  /** Server time in ms epoch (from OTC tick timestamp) */
  serverTime?: number;
}

export default function CandleCountdown({ bucketMs, serverTime }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const srvNow = serverTime ?? now;
      const ms = Number(bucketMs);
      if (!Number.isFinite(ms) || ms <= 0) { setRemaining(0); return; }
      const next = Math.ceil(srvNow / ms) * ms;
      setRemaining(Math.max(0, next - srvNow));
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [bucketMs, serverTime]);

  const totalSec = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const isUrgent = remaining <= 3000 && remaining > 0;

  return (
    <span
      className={`candle-countdown ${isUrgent ? 'urgent' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        background: '#ffffff',
        border: '1px solid #e3e7ee',
        color: isUrgent ? '#b26b00' : '#0d111a',
        fontSize: 12,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'ui-monospace, Menlo, monospace',
        transition: 'color 0.3s ease',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 14 14" />
      </svg>
      {mm}:{ss}
    </span>
  );
}
