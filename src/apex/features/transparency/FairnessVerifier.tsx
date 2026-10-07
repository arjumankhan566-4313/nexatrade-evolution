import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Disclaimer } from '../../components/primitives';
import { FAIRNESS_SAMPLE } from '../../config/content.config';
import { isWebCryptoAvailable, verifyFairness } from '../../lib/provablyFair';
import type { FairnessOutcome } from '../../lib/provablyFair';

const FIELD_CLASS =
  'apex-focusable mt-1.5 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-[12px] text-apex-ink placeholder:text-apex-faint focus:border-apex-cyan/50';

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function Field({ id, label, hint, value, onChange, placeholder }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-apex-ink">{label}</span>
        {hint ? <span className="text-[10px] text-apex-faint">{hint}</span> : null}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      />
    </div>
  );
}

/**
 * Feature 4 — working commit–reveal verifier. Every digest shown here is
 * computed by the browser's Web Crypto API from the values in the fields; no
 * digest is pre-baked. "Load example inputs" always reproduces the shipped hash.
 */
export default function FairnessVerifier() {
  const [serverSeed, setServerSeed] = useState<string>(FAIRNESS_SAMPLE.serverSeed);
  const [clientSeed, setClientSeed] = useState<string>(FAIRNESS_SAMPLE.clientSeed);
  const [nonce, setNonce] = useState<string>(FAIRNESS_SAMPLE.nonce);
  const [publishedHash, setPublishedHash] = useState<string>(FAIRNESS_SAMPLE.expectedHash);
  const [outcome, setOutcome] = useState<FairnessOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleVerify() {
    setBusy(true);
    setFailure(null);
    try {
      if (!isWebCryptoAvailable()) {
        throw new Error(
          'Web Crypto is unavailable in this browser context, so the hash cannot be computed honestly.'
        );
      }
      setOutcome(await verifyFairness({ serverSeed, clientSeed, nonce }, publishedHash));
    } catch (cause: unknown) {
      setOutcome(null);
      setFailure(cause instanceof Error ? cause.message : 'Verification failed unexpectedly.');
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setServerSeed(FAIRNESS_SAMPLE.serverSeed);
    setClientSeed(FAIRNESS_SAMPLE.clientSeed);
    setNonce(FAIRNESS_SAMPLE.nonce);
    setPublishedHash(FAIRNESS_SAMPLE.expectedHash);
    setOutcome(null);
    setFailure(null);
  }

  function clearAll() {
    setServerSeed('');
    setClientSeed('');
    setNonce('1');
    setPublishedHash('');
    setOutcome(null);
    setFailure(null);
  }

  const ready = serverSeed.length > 0 && clientSeed.length > 0 && nonce.length > 0;

  return (
    <div className="apex-glass apex-hairline p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-apex text-lg font-semibold text-apex-ink">Verify a settlement</h3>
        <span className="text-[11px] text-apex-faint">{FAIRNESS_SAMPLE.note}</span>
      </div>

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleVerify();
        }}
      >
        <Field
          id="apex-server-seed"
          label="Server seed"
          hint="revealed after the round"
          value={serverSeed}
          onChange={setServerSeed}
          placeholder="published server seed"
        />
        <Field
          id="apex-client-seed"
          label="Client seed"
          hint="yours"
          value={clientSeed}
          onChange={setClientSeed}
          placeholder="your client seed"
        />
        <Field
          id="apex-nonce"
          label="Nonce"
          hint="round number"
          value={nonce}
          onChange={setNonce}
          placeholder="1"
        />
        <Field
          id="apex-published-hash"
          label="Published hash"
          hint="optional — leave blank to only inspect"
          value={publishedHash}
          onChange={setPublishedHash}
          placeholder="hash shown before the round"
        />

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            className="apex-btn apex-btn--primary px-5 py-2.5 text-sm disabled:opacity-50"
            disabled={busy || !ready}
          >
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Computing…' : 'Compute SHA-256'}
          </button>
          <button type="button" className="apex-btn apex-btn--ghost px-4 py-2.5 text-sm" onClick={loadSample}>
            Load example inputs
          </button>
          <button type="button" className="apex-btn apex-btn--ghost px-4 py-2.5 text-sm" onClick={clearAll}>
            Clear
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-6 space-y-4">
        {failure ? (
          <p role="alert" className="rounded-xl border border-apex-crimson/30 bg-apex-crimson/10 px-4 py-3 text-sm text-apex-ink">
            {failure}
          </p>
        ) : null}

        {outcome ? (
          <div className="space-y-4">
            <div
              className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                outcome.matches === null
                  ? 'bg-white/5 text-apex-muted'
                  : outcome.matches
                    ? 'bg-apex-emerald/12 text-apex-ink'
                    : 'bg-apex-crimson/12 text-apex-ink'
              }`}
            >
              {outcome.matches === null ? (
                <ShieldQuestion aria-hidden="true" className="h-4 w-4" />
              ) : outcome.matches ? (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-apex-emerald" />
              ) : (
                <XCircle aria-hidden="true" className="h-4 w-4 text-apex-crimson" />
              )}
              <span className="font-semibold">
                {outcome.matches === null
                  ? 'No published hash supplied — digests computed, nothing compared.'
                  : outcome.matches
                    ? 'Match — the revealed seed reproduces the published hash.'
                    : 'Mismatch — this hash was NOT produced by these inputs.'}
              </span>
            </div>

            <dl className="grid gap-3 text-[12px]">
              <div>
                <dt className="text-apex-faint">Hashed message</dt>
                <dd className="mt-1 break-all font-mono text-apex-muted">{outcome.message}</dd>
              </div>
              <div>
                <dt className="text-apex-faint">Commitment · SHA-256(server seed)</dt>
                <dd className="mt-1 break-all font-mono text-apex-ink">{outcome.commitment}</dd>
              </div>
              <div>
                <dt className="text-apex-faint">
                  Settlement digest · HMAC-SHA256(server seed, client seed:nonce)
                </dt>
                <dd className="mt-1 break-all font-mono text-apex-cyan">{outcome.resultHash}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      <Disclaimer className="mt-6">
        Hashes are computed locally with the Web Crypto API — nothing is sent anywhere. Verification
        proves the published commitment matches the revealed seed; it does not predict trading outcomes.
      </Disclaimer>
    </div>
  );
}
