import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy as CopyIcon, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  COPY_HUB_FEATURES,
  COPY_MODES,
  COPY_SAMPLE_LEADERS,
  RISK_DISCLOSURES,
} from '../../config/content.config';
import { Disclaimer, GlassCard, SectionHeading, SectionShell, TiltCard } from '../../components/primitives';
import { useResource } from '../../hooks/useResource';
import { marketProvider } from '../../providers';

/**
 * Feature 3 — Copy trading & social hub.
 *
 * The interface is real and interactive: leader cards, allocation controls and
 * a hard risk-acknowledgement gate. Rankings publish from settled trades, so
 * the cards carry LIVE payout rates for the leader's markets instead of an
 * invented performance figure.
 */

const PANEL_ID = 'apex-allocation-panel';

/** Live payout rate for one symbol, or null while the feed is loading. */
function usePayouts() {
  const { data, status } = useResource(() => marketProvider.getPayouts(), marketProvider.id);
  return { payouts: data, status };
}

function MarketChip({
  symbol,
  payout,
  pending,
}: {
  symbol: string;
  payout: number | null;
  pending: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-apex-muted ring-1 ring-inset ring-white/10">
      <span className="font-mono text-[10px] text-apex-ink">{symbol.replace('-OTC', '')}</span>
      <span className="text-apex-cyan">
        {pending ? '·' : payout === null ? '—' : `${payout.toFixed(0)}%`}
      </span>
    </span>
  );
}

export default function CopyTradingSection() {
  const reduceMotion = useReducedMotion();
  const { payouts, status: payoutStatus } = usePayouts();

  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [mode, setMode] = useState<string>(COPY_MODES[0].id);
  const [ratio, setRatio] = useState(100);
  const [maxStake, setMaxStake] = useState(50);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const leader = COPY_SAMPLE_LEADERS.find((entry) => entry.id === leaderId) ?? null;
  const payoutPending = payoutStatus === 'loading';

  function open(entryId: string) {
    setLeaderId(entryId);
    setConfirmed(false);
    setAcknowledged(false);
    setMode(COPY_MODES[0].id);
    setRatio(100);
    setMaxStake(50);
  }

  function close() {
    setLeaderId(null);
  }

  // Escape closes the allocation panel, mirroring the market selector.
  useEffect(() => {
    if (!leader) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [leader]);

  return (
    <SectionShell id="social">
      <SectionHeading
        eyebrow="Social hub"
        title="Mirror a trader without guessing at the numbers"
        description="Leader cards are ranked from settled trades, and every allocation passes through a payout-adjusted risk gate before it can be switched on."
        aside={
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-apex-faint ring-1 ring-inset ring-white/12">
            Interface preview
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {COPY_SAMPLE_LEADERS.map((entry, index) => {
          const pending = payoutStatus === 'loading';
          return (
            <motion.div
              key={entry.id}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
            >
              <TiltCard intensity={0.5} className="h-full">
                <GlassCard className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-apex text-base font-semibold text-apex-ink">
                        {entry.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-apex-faint">
                        {entry.tier} tier
                      </p>
                    </div>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-apex-cyan/12 font-apex text-xs font-bold text-apex-cyan ring-1 ring-inset ring-apex-cyan/25">
                      {entry.name.split(' ')[1]}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {entry.markets.map((symbol) => (
                      <MarketChip
                        key={symbol}
                        symbol={symbol}
                        payout={payouts?.[symbol] ?? null}
                        pending={pending}
                      />
                    ))}
                  </div>

                  <p className="mt-4 text-[12px] leading-relaxed text-apex-muted">
                    Ranking publishes from settled trades in the selected window — never from a
                    single lucky fill.
                  </p>

                  <button
                    type="button"
                    onClick={() => open(entry.id)}
                    className="apex-btn apex-btn--ghost apex-focusable mt-5 w-full px-4 py-2 text-[13px]"
                  >
                    <CopyIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    Allocate
                  </button>
                </GlassCard>
              </TiltCard>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COPY_HUB_FEATURES.map((feature) => (
          <GlassCard key={feature.id} className="p-5" depth={false}>
            <h3 className="font-apex text-sm font-semibold text-apex-ink">{feature.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-apex-muted">{feature.description}</p>
          </GlassCard>
        ))}
      </div>

      <Disclaimer className="mt-6">{RISK_DISCLOSURES.copyTrading}</Disclaimer>

      {/* ── Allocation panel ── */}
      <AnimatePresence>
        {leader ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.section
              id={PANEL_ID}
              role="dialog"
              aria-modal="true"
              aria-label={`Allocate to ${leader.name}`}
              className="apex-glass apex-glass--strong apex-hairline w-[min(96vw,32rem)] max-h-[88vh] overflow-y-auto p-5 sm:p-6"
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-apex-faint">
                    Allocation
                  </p>
                  <h3 className="mt-1 font-apex text-lg font-semibold text-apex-ink">
                    {leader.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close allocation panel"
                  className="apex-btn apex-btn--ghost apex-focusable h-8 w-8"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </header>

              {confirmed ? (
                <div className="mt-6 rounded-apex border border-apex-emerald/30 bg-apex-emerald/8 p-5 text-center">
                  <Check aria-hidden="true" className="mx-auto h-5 w-5 text-apex-emerald" />
                  <p className="mt-3 font-apex text-sm font-semibold text-apex-ink">
                    Allocation prepared
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-apex-muted">
                    {leader.name} ·{' '}
                    {mode === COPY_MODES[0].id ? `${ratio}% of every stake` : 'fixed stake'} capped
                    at ${maxStake} per trade. Live copy links are created through the social
                    service, which this surface does not call yet.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="apex-btn apex-btn--ghost apex-focusable mt-5 px-4 py-2 text-[13px]"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <fieldset className="mt-6">
                    <legend className="text-[11px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
                      Mode
                    </legend>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {COPY_MODES.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setMode(option.id)}
                          aria-pressed={mode === option.id}
                          className={`apex-focusable rounded-apex border p-3.5 text-left transition-colors ${
                            mode === option.id
                              ? 'border-apex-cyan/40 bg-apex-cyan/8'
                              : 'border-white/10 bg-white/4 hover:bg-white/8'
                          }`}
                        >
                          <span className="font-apex text-sm font-semibold text-apex-ink">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-[12px] leading-relaxed text-apex-muted">
                            {option.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="flex items-center justify-between text-[12px] text-apex-muted">
                        <span>Mirror ratio</span>
                        <span className="font-mono text-apex-ink">{ratio}%</span>
                      </span>
                      <input
                        type="range"
                        min={5}
                        max={300}
                        step={5}
                        value={ratio}
                        disabled={mode !== COPY_MODES[0].id}
                        onChange={(event) => setRatio(Number(event.target.value))}
                        className="mt-2 w-full accent-apex-cyan disabled:opacity-40"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[12px] text-apex-muted">Maximum stake per trade</span>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={maxStake}
                        onChange={(event) => setMaxStake(Number(event.target.value))}
                        className="apex-focusable mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[13px] text-apex-ink focus:border-apex-cyan/50"
                      />
                    </label>
                  </div>

                  {/* Hard gate: no acknowledgement, no allocation. */}
                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-apex border border-white/10 bg-white/4 p-4">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-apex-cyan"
                    />
                    <span className="text-[12px] leading-relaxed text-apex-muted">
                      <ShieldAlert
                        aria-hidden="true"
                        className="mr-1.5 inline h-3.5 w-3.5 text-apex-crimson"
                      />
                      I understand that copying mirrors losses as well as wins, and that my capital is
                      at risk.
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={!acknowledged}
                    onClick={() => setConfirmed(true)}
                    className="apex-btn apex-btn--primary apex-focusable mt-4 w-full px-4 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prepare allocation
                  </button>

                  <Disclaimer className="mt-3">{RISK_DISCLOSURES.copyTrading}</Disclaimer>
                </>
              )}
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SectionShell>
  );
}
