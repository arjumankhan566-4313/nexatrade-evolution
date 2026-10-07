import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Terminal } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  API_CAPABILITIES,
  API_SAMPLE_ENDPOINT,
  API_SAMPLE_RESPONSE,
} from '../../config/content.config';
import { GlassCard, SectionHeading, SectionShell } from '../../components/primitives';

/**
 * Feature 6 — Institutional & API access.
 *
 * The capability matrix lists endpoints that genuinely answer on this
 * deployment — nothing aspirational is marked available.
 */

const ACCESS_STYLE: Record<string, string> = {
  Public: 'text-apex-emerald bg-apex-emerald/10 ring-apex-emerald/25',
  Authenticated: 'text-apex-cyan bg-apex-cyan/10 ring-apex-cyan/25',
};

export default function InstitutionalSection() {
  const reduceMotion = useReducedMotion();

  return (
    <SectionShell id="institutional">
      <SectionHeading
        eyebrow="Institutional"
        title="The same surface we trade on, over HTTP and sockets"
        description="Market data, payouts, candles and the live tick stream are exposed directly. Order placement is the only call that needs a session."
        aside={
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-apex-faint ring-1 ring-inset ring-white/12">
            Interface preview
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Capability matrix */}
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
                    Endpoint
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
                    Purpose
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
                    Access
                  </th>
                </tr>
              </thead>
              <tbody>
                {API_CAPABILITIES.map((capability, index) => (
                  <motion.tr
                    key={capability.id}
                    className="border-b border-white/6 last:border-0"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.35, delay: index * 0.04 }}
                  >
                    <td className="px-5 py-3.5 font-mono text-[12px] text-apex-ink">
                      {capability.endpoint}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] leading-relaxed text-apex-muted">
                      {capability.purpose}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${
                          ACCESS_STYLE[capability.access] ?? ACCESS_STYLE["Public"]
                        }`}
                      >
                        {capability.access}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Docs preview + access */}
        <div className="space-y-4">
          <GlassCard className="p-5" strong>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-apex-faint">
              <Terminal aria-hidden="true" className="h-3.5 w-3.5 text-apex-cyan" />
              {API_SAMPLE_ENDPOINT}
            </span>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/8 bg-black/45 p-4 font-mono text-[11.5px] leading-relaxed text-apex-muted">
              {API_SAMPLE_RESPONSE}
            </pre>
          </GlassCard>

          <GlassCard className="p-6" depth={false}>
            <h3 className="font-apex text-sm font-semibold text-apex-ink">Request access</h3>
            <ul className="mt-4 space-y-2.5">
              {['Full catalogue and candle history', 'Live tick stream over sockets', 'Sandbox keys for integration testing'].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[12.5px] text-apex-muted">
                    <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-apex-lime" />
                    {item}
                  </li>
                )
              )}
            </ul>
            <Link
              to="/register"
              className="apex-btn apex-btn--primary apex-focusable mt-5 w-full px-4 py-2.5 text-[13px]"
            >
              Open an account
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </GlassCard>
        </div>
      </div>
    </SectionShell>
  );
}
