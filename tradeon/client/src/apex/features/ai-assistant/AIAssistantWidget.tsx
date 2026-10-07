import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Disclaimer } from '../../components/primitives';
import { BRAND, RISK_DISCLOSURES } from '../../config/content.config';
import { aiProvider } from '../../providers';
import type { SentimentReading } from '../../providers/types';

/**
 * Feature 2 — the floating AI assistant.
 *
 * Replies stream in from `aiProvider.ask()` while the "not financial advice"
 * notice stays permanently visible; any provider implementation can back it.
 *
 * Suggested and follow-up prompts live INSIDE the conversation — a starter
 * message with chips when the chat is empty, and follow-up chips beneath a
 * finished reply — never as a detached row above the composer.
 */

const DEFAULT_SYMBOL = 'BTCUSD';
/** If the provider stops sending chunks, release the composer instead of locking it. */
const STREAM_STALL_MS = 3000;
const PANEL_ID = 'apex-ai-panel';
const INPUT_ID = 'apex-ai-input';
const GAUGE_RADIUS = 50;
const GAUGE_LENGTH = Math.PI * GAUGE_RADIUS;

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };

function SentimentGauge({ reading }: { reading: SentimentReading }) {
  const offset = GAUGE_LENGTH * (1 - reading.bullishPct / 100);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 66" role="img" aria-label={`${reading.bullishPct} percent bullish`} className="h-16 w-28 shrink-0">
        <path
          d={`M 10 60 A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 110 60`}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M 10 60 A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 110 60`}
          fill="none"
          stroke="url(#apex-gauge)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={GAUGE_LENGTH}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="apex-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="50%" stopColor="#f2b84b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <text x="60" y="52" textAnchor="middle" className="fill-apex-ink text-[20px] font-semibold">
          {reading.bullishPct}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-apex-cyan">
          {reading.symbol}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-apex-muted">{reading.summary}</p>
        <p className="mt-1 text-[11px] text-apex-faint">
          Confidence {(reading.confidence * 100).toFixed(0)}%
        </p>
      </div>
    </div>
  );
}

/** Three-dot typing indicator shown while a reply streams its first tokens. */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-apex-muted [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-apex-muted [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-apex-muted" />
    </span>
  );
}

/** A prompt chip rendered inside the conversation flow. */
function PromptChip({
  label,
  disabled,
  onPick,
}: {
  label: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="apex-focusable rounded-full bg-white/5 px-3 py-1.5 text-left text-[11px] leading-snug text-apex-muted ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/8 hover:text-apex-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export default function AIAssistantWidget() {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sentiment, setSentiment] = useState<SentimentReading | null>(null);
  const [sentimentError, setSentimentError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(0);

  // Keyboard: Escape closes the panel and hands focus back to the launcher.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Sentiment is fetched by the provider whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSentimentError(null);

    aiProvider
      .getSentiment(DEFAULT_SYMBOL)
      .then((reading) => {
        if (!cancelled) setSentiment(reading);
      })
      .catch(() => {
        if (!cancelled) setSentimentError('The sentiment reading is unavailable right now.');
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (trimmed.length === 0 || streaming) return;

    const runId = runRef.current + 1;
    runRef.current = runId;
    const replyId = `assistant-${runId}`;

    setMessages((current) => [
      ...current,
      { id: `user-${runId}`, role: 'user', text: trimmed },
      { id: replyId, role: 'assistant', text: '' },
    ]);
    setDraft('');
    setStreaming(true);

    // Rearmed on every chunk: a stream that dies mid-reply must not leave the
    // composer disabled with no way to send the next message.
    let stallTimer: number | undefined;
    const armStall = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        if (runRef.current === runId) setStreaming(false);
      }, STREAM_STALL_MS);
    };

    try {
      armStall();
      for await (const chunk of aiProvider.ask(trimmed, { symbol: sentiment?.symbol ?? DEFAULT_SYMBOL })) {
        if (runRef.current !== runId) return;
        armStall();
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId ? { ...message, text: message.text + chunk } : message
          )
        );
      }
    } catch {
      if (runRef.current === runId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId
              ? { ...message, text: 'The provider failed while streaming this reply.' }
              : message
          )
        );
      }
    } finally {
      window.clearTimeout(stallTimer);
      if (runRef.current === runId) setStreaming(false);
    }
  }

  // Follow-ups are offered only once a reply has finished, beneath the last
  // assistant message and inside the conversation.
  const lastMessage = messages[messages.length - 1];
  const lastUserPrompt = [...messages].reverse().find((message) => message.role === 'user')?.text;
  const followUps =
    !streaming && lastMessage?.role === 'assistant' && lastMessage.text.length > 0 && lastUserPrompt
      ? aiProvider
          .followUps(lastUserPrompt, { symbol: sentiment?.symbol ?? DEFAULT_SYMBOL })
          .filter((prompt) => prompt !== lastUserPrompt)
      : [];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className="apex-btn apex-glow-ring apex-focusable fixed bottom-5 right-5 z-40 bg-apex-surface/90 px-4 py-3 text-sm text-apex-ink shadow-lg sm:bottom-7 sm:right-7"
      >
        {open ? (
          <X aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Sparkles aria-hidden="true" className="h-4 w-4 text-apex-cyan" />
        )}
        <span>{open ? 'Close' : BRAND.assistantName}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.section
            id={PANEL_ID}
            role="dialog"
            aria-label={`${BRAND.assistantName} market assistant`}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            className="apex-glass apex-glass--strong apex-hairline fixed bottom-24 right-4 z-40 flex max-h-[78vh] w-[min(92vw,26rem)] flex-col overflow-hidden sm:right-7"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-apex-cyan" />
                <span className="font-apex text-sm font-semibold text-apex-ink">
                  {BRAND.assistantName}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-apex-faint">
                market assistant
              </span>
            </header>

            <div className="space-y-3 border-b border-white/8 px-4 py-4">
              {sentimentError ? (
                <p role="alert" className="text-[12px] text-apex-crimson">
                  {sentimentError}
                </p>
              ) : sentiment ? (
                <SentimentGauge reading={sentiment} />
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-apex-muted">
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  Loading sentiment…
                </div>
              )}
            </div>

            <div
              ref={logRef}
              className="min-h-[9rem] flex-1 space-y-3 overflow-y-auto px-4 py-4"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="max-w-[92%] rounded-2xl bg-white/6 px-3 py-2 text-[13px] leading-relaxed text-apex-ink">
                    Hi — I’m {BRAND.assistantName}. Ask me about a live market, the commit–reveal
                    fairness model, deposits and withdrawals, payouts, or the risks of copy trading.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aiProvider.suggestedPrompts().map((prompt) => (
                      <PromptChip
                        key={prompt}
                        label={prompt}
                        disabled={streaming}
                        onPick={() => void send(prompt)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <p
                      key={message.id}
                      className={`max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                        message.role === 'user'
                          ? 'ml-auto bg-apex-cyan/14 text-apex-ink'
                          : 'bg-white/6 text-apex-ink'
                      }`}
                    >
                      {message.text.length === 0 && streaming ? <TypingDots /> : message.text}
                    </p>
                  ))}
                  {followUps.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {followUps.map((prompt) => (
                        <PromptChip
                          key={prompt}
                          label={prompt}
                          disabled={streaming}
                          onPick={() => void send(prompt)}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="border-t border-white/8 px-4 py-3">
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
              >
                <label htmlFor={INPUT_ID} className="sr-only">
                  Message {BRAND.assistantName}
                </label>
                <input
                  id={INPUT_ID}
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask the assistant…"
                  className="apex-focusable flex-1 rounded-full border border-white/10 bg-black/35 px-3.5 py-2 text-[13px] text-apex-ink placeholder:text-apex-faint"
                />
                <button
                  type="submit"
                  className="apex-btn apex-btn--primary apex-focusable h-9 w-9"
                  disabled={streaming || draft.trim().length === 0}
                  aria-label="Send message"
                >
                  {streaming ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              </form>

              <Disclaimer className="mt-3">{RISK_DISCLOSURES.aiOutput}</Disclaimer>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
