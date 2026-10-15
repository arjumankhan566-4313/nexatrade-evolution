import {
  Disclaimer,
  GlassCard,
  SectionHeading,
  SectionShell,
  TiltCard,
} from "../../components/primitives";
import { FAIRNESS_FLOW } from "../../config/content.config";
import FairnessVerifier from "./FairnessVerifier";
import MetricsStrip from "./MetricsStrip";

/** Feature 4 — Transparency Centre: the fairness model, its verifier and metrics. */
export default function FairnessSection() {
  return (
    <SectionShell id="fairness">
      <SectionHeading
        eyebrow="Transparency centre"
        title="Fairness you can recompute yourself"
        description="Settlement randomness is derived from a server seed the operator commits to before the round and reveals afterwards. You never have to take the result on trust — the verifier below runs in your browser."
        aside={
          <span className="text-[11px] uppercase tracking-[0.18em] text-apex-faint">
            Attestation pending
          </span>
        }
      />

      <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {FAIRNESS_FLOW.map((step, index) => (
          <li key={step.id}>
            <TiltCard intensity={0.6} className="h-full">
              <GlassCard className="flex h-full flex-col p-5">
                <span className="font-mono text-xs text-apex-cyan">{`0${index + 1}`}</span>
                <h3 className="mt-2 font-apex text-base font-semibold text-apex-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-apex-muted">
                  {step.description}
                </p>
              </GlassCard>
            </TiltCard>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <FairnessVerifier />
        <div className="space-y-4">
          <h3 className="font-apex text-lg font-semibold text-apex-ink">Live system metrics</h3>
          <MetricsStrip />
        </div>
      </div>

      <Disclaimer className="mt-8">{`Provable fairness covers settlement randomness only — it is not a claim about returns. Past performance is not indicative of future results.`}</Disclaimer>
    </SectionShell>
  );
}
