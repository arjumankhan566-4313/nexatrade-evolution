import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, LineChart } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import AIAssistantWidget from '../features/ai-assistant/AIAssistantWidget';
import CopyTradingSection from '../features/copy-trading/CopyTradingSection';
import GamificationSection from '../features/gamification/GamificationSection';
import InstitutionalSection from '../features/institutional/InstitutionalSection';
import LiveSocialTicker from '../features/social-ticker/LiveSocialTicker';
import FairnessSection from '../features/transparency/FairnessSection';
import { Disclaimer, GlassCard, SectionShell, TiltCard } from '../components/primitives';
import SpatialBackground from '../components/SpatialBackground';
import TradeonLogo from '../components/TradeonLogo';
import {
  APEX_PILLARS,
  BRAND,
  LANDING_NAV,
  MARKETING_CLAIMS,
  PILLAR_STATUS_LABEL,
  RISK_DISCLOSURES,
  claimViewModel,
} from '../config/content.config';
import type { PillarStatus } from '../config/content.config';

/**
 * TRADEON landing surface.
 *
 * Only features working against real data are marked "Live"; a shipped
 * interface whose backing service is not connected reads "Preview", and
 * anything unbuilt reads "Planned".
 */

const STATUS_STYLE: Record<PillarStatus, string> = {
  live: 'text-apex-emerald bg-apex-emerald/12 ring-apex-emerald/30',
  preview: 'text-apex-cyan bg-apex-cyan/12 ring-apex-cyan/30',
  planned: 'text-apex-faint bg-white/5 ring-white/12',
};

function PillarCard({
  title,
  description,
  status,
  href,
  index,
}: {
  title: string;
  description: string;
  status: PillarStatus;
  href?: string | undefined;
  index: number;
}) {
  description: string;
  status: PillarStatus;
  href?: string;
  index: number;
}) {
  const reduceMotion = useReducedMotion();

  const card = (
    <GlassCard className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-apex text-base font-semibold text-apex-ink">{title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ring-inset ${STATUS_STYLE[status]}`}
        >
          {PILLAR_STATUS_LABEL[status]}
        </span>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-apex-muted">{description}</p>
      {href ? (
        <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-apex-cyan">
          See it
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </GlassCard>
  );

  return (
    <motion.div
      className="h-full"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
    >
      <TiltCard intensity={0.5} className="h-full">
        {href ? (
          <a href={href} className="apex-focusable block h-full rounded-apex">
            {card}
          </a>
        ) : (
          card
        )}
      </TiltCard>
    </motion.div>
  );
}

export default function ApexLandingPage() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="apex-space min-h-screen overflow-x-hidden font-apex text-apex-ink">
      <SpatialBackground />

      <header className="sticky top-0 z-30 border-b border-white/6 bg-apex-void/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-3.5">
          <Link to="/" className="apex-focusable rounded-xl" aria-label={BRAND.name}>
            {/* Header lockup: logo only — the brand subtitle belongs to the hero. */}
            <TradeonLogo variant="nav" />
          </Link>

          <nav aria-label="Landing" className="hidden items-center gap-5 md:flex lg:gap-7">
            {LANDING_NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="apex-focusable rounded text-[12.5px] text-apex-muted transition-colors hover:text-apex-ink lg:text-[13px]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="apex-btn apex-btn--ghost apex-focusable px-3.5 py-2 text-[12.5px] sm:text-[13px]"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="apex-btn apex-btn--primary apex-focusable px-3.5 py-2 text-[12.5px] sm:text-[13px]"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <SectionShell className="pb-10 pt-14 sm:pt-24">
          <div className="max-w-3xl">
            {/* Hero lockup: the ONLY place the brand subtitle appears. */}
            <TradeonLogo variant="hero" showTagline />

            <motion.h1
              className="mt-8 font-apex text-[2rem] font-semibold leading-[1.08] tracking-tight sm:mt-10 sm:text-6xl"
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 170, damping: 24, delay: 0.18 }}
            >
              {BRAND.headline}
            </motion.h1>

            <motion.p
              className="mt-5 max-w-2xl text-[15px] leading-relaxed text-apex-muted sm:mt-6 sm:text-lg"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28 }}
            >
              A trading surface built for clarity: spatial glass interface, a fairness model you can
              recompute in your browser, and system metrics read live from the running engine.
            </motion.p>

            <motion.div
              className="mt-8 flex flex-wrap items-center gap-3 sm:mt-9"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.36 }}
            >
              <Link
                to="/register"
                className="apex-btn apex-btn--primary apex-focusable px-5 py-3 text-sm sm:px-6"
              >
                Open an account
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                to="/chart"
                className="apex-btn apex-btn--ghost apex-focusable px-5 py-3 text-sm sm:px-6"
              >
                <LineChart aria-hidden="true" className="h-4 w-4" />
                Explore the live chart
              </Link>
            </motion.div>
          </div>

          <GlassCard className="mt-12 p-5 sm:mt-14 sm:p-6" strong>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-apex text-sm font-semibold text-apex-ink">Claim status</h2>
              <span className="text-[11px] text-apex-faint">Published once measured</span>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {MARKETING_CLAIMS.map((claim) => {
                const view = claimViewModel(claim);
                return (
                  <div
                    key={claim.id}
                    className="rounded-apex bg-white/4 p-4 ring-1 ring-inset ring-white/8"
                  >
                    <dt className="text-[13px] text-apex-muted">{claim.label}</dt>
                    <dd className="mt-2 flex items-center gap-2">
                      {view.isPlaceholder ? (
                        <span className="text-sm text-apex-faint">{view.display}</span>
                      ) : (
                        <span className="font-apex text-lg font-semibold">{view.display}</span>
                      )}
                    </dd>
                    {claim.note ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-apex-faint">{claim.note}</p>
                    ) : null}
                  </div>
                );
              })}
            </dl>
          </GlassCard>
        </SectionShell>

        {/* ── Pillars ── */}
        <SectionShell id="platform">
          <header className="mb-9 max-w-3xl">
            <span className="font-apex text-[11px] font-semibold uppercase tracking-[0.28em] text-apex-cyan/80">
              Platform
            </span>
            <h2 className="mt-3 font-apex text-3xl font-semibold leading-tight sm:text-4xl">
              Six pillars, stated honestly
            </h2>
            <p className="mt-4 text-base leading-relaxed text-apex-muted">
              Each pillar below declares exactly where it stands today — live against real data, a
              shipped interface with no service behind it yet, or still planned.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {APEX_PILLARS.map((pillar, index) => (
              <PillarCard
                key={pillar.id}
                title={pillar.title}
                description={pillar.description}
                status={pillar.status}
                href={pillar.href}
                index={index}
              />
            ))}
          </div>
        </SectionShell>

        <CopyTradingSection />
        <GamificationSection />
        <InstitutionalSection />
        <FairnessSection />
      </main>

      <footer className="border-t border-white/6 bg-apex-void/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-sm">
              {/* Footer lockup: logo only — never the brand subtitle. */}
              <TradeonLogo variant="footer" />
              <Disclaimer className="mt-4">{RISK_DISCLOSURES.trading}</Disclaimer>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
              <Link to="/chart" className="apex-focusable rounded text-apex-muted hover:text-apex-ink">
                Live chart
              </Link>
              <Link to="/login" className="apex-focusable rounded text-apex-muted hover:text-apex-ink">
                Sign in
              </Link>
              <Link
                to="/register"
                className="apex-focusable rounded text-apex-muted hover:text-apex-ink"
              >
                Create account
              </Link>
            </nav>
          </div>
          <Disclaimer className="mt-8">{RISK_DISCLOSURES.pastPerformance}</Disclaimer>
        </div>
      </footer>

      <AIAssistantWidget />
      <LiveSocialTicker />
    </div>
  );
}
