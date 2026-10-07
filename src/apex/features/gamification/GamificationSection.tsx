import { motion, useReducedMotion } from 'framer-motion';
import { Clock, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ONBOARDING_MILESTONES, RISK_DISCLOSURES, TOURNAMENT_ROTATION } from '../../config/content.config';
import { Disclaimer, GlassCard, SectionHeading, SectionShell } from '../../components/primitives';

/**
 * Feature 5 — Guided onboarding & tournaments.
 *
 * The countdown is driven by a real clock against the published cadence; the
 * leaderboard is a shell until entries open, so it never shows a fabricated
 * standing. Promotional rewards always carry their terms.
 */

/** Time left until the next round roll, derived from the published cadence. */
function nextRoundAt(now: number): number {
  const cadenceMs = TOURNAMENT_ROTATION.cadenceHours * 3_600_000;
  return (Math.floor(now / cadenceMs) + 1) * cadenceMs;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export default function GamificationSection() {
  const reduceMotion = useReducedMotion();
  const [remaining, setRemaining] = useState(() => nextRoundAt(Date.now()) - Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(nextRoundAt(Date.now()) - Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <SectionShell id="tournaments">
      <SectionHeading
        eyebrow="Onboarding & tournaments"
        title="A first trade, then a leaderboard worth climbing"
        description="Four milestones take a new account from verification to tournament eligibility, and every round is scored on settled trades inside a fixed window."
        aside={
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-apex-faint ring-1 ring-inset ring-white/12">
            Interface preview
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* Milestones */}
        <GlassCard className="p-6">
          <h3 className="font-apex text-sm font-semibold text-apex-ink">Onboarding path</h3>
          <ol className="mt-5 space-y-1">
            {ONBOARDING_MILESTONES.map((milestone, index) => (
              <motion.li
                key={milestone.id}
                className="relative flex gap-4 pb-6 last:pb-0"
                initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.4, delay: index * 0.07 }}
              >
                {/* Progress rail */}
                <span className="relative flex flex-col items-center">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-apex-cyan/12 font-mono text-[11px] font-semibold text-apex-cyan ring-1 ring-inset ring-apex-cyan/30">
                    {index + 1}
                  </span>
                  {index < ONBOARDING_MILESTONES.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="mt-1 w-px flex-1 bg-gradient-to-b from-apex-cyan/30 to-transparent"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block font-apex text-[14px] font-semibold text-apex-ink">
                    {milestone.title}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-apex-muted">
                    {milestone.reward}
                  </span>
                </span>
              </motion.li>
            ))}
          </ol>
          <Disclaimer className="mt-4">{RISK_DISCLOSURES.gamification}</Disclaimer>
        </GlassCard>

        {/* Round card */}
        <div className="space-y-4">
          <GlassCard className="p-6" strong>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
                <Trophy aria-hidden="true" className="h-3.5 w-3.5 text-apex-cyan" />
                {TOURNAMENT_ROTATION.title}
              </span>
            </div>

            <p className="mt-4 flex items-center gap-2 font-mono text-3xl font-semibold text-apex-ink tabular-nums">
              <Clock aria-hidden="true" className="h-5 w-5 text-apex-cyan" />
              {formatCountdown(remaining)}
            </p>
            <p className="mt-1.5 text-[11px] text-apex-faint">
              Until the next round rolls, every {TOURNAMENT_ROTATION.cadenceHours} hours.
            </p>

            <p className="mt-4 text-[13px] leading-relaxed text-apex-muted">
              {TOURNAMENT_ROTATION.description}
            </p>
          </GlassCard>

          <GlassCard className="p-6" depth={false}>
            <h3 className="font-apex text-sm font-semibold text-apex-ink">Round leaderboard</h3>
            <div className="mt-4 rounded-apex border border-dashed border-white/12 px-5 py-7 text-center">
              <p className="text-[13px] leading-relaxed text-apex-muted">
                Standings publish the moment the round opens and are scored on settled trades only —
                never on open positions.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </SectionShell>
  );
}
