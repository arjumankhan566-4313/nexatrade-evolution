import { BRAND } from "../../config/content.config";
import type { AIAssistantProvider, SentimentReading } from "../types";

/**
 * Built-in TRADEON AI provider — Feature 2.
 *
 * The sentiment reading and the streaming reply are produced locally, never by
 * a model. Swap this factory for a real API client implementing
 * `AIAssistantProvider` and the widget is unchanged.
 *
 * `KNOWLEDGE` is the assistant's whole answer set: each entry owns its reply
 * and the follow-up prompts offered inside the conversation afterwards. Adding
 * a topic means adding one entry here — the widget needs no change.
 */

const LATENCY_MS = 220;
const FIRST_TOKEN_MS = 160;
const STREAM_CHUNK_MS = 14;
const WORDS_PER_CHUNK = 3;
const BTCUSD_SENTIMENT_PCT = 78;

type KnowledgeEntry = {
  /** Matched against the lower-cased prompt. */
  match: RegExp;
  /** Reply body. `%SYM%`, `%PCT%` and `%NAME%` are substituted before streaming. */
  body: string;
  /** Prompts offered beneath the reply; `%SYM%` is substituted too. */
  followUps: readonly string[];
};

/** Shown inside the empty conversation, not as a detached row above the composer. */
const STARTING_PROMPTS = [
  "What is the sentiment on BTCUSD?",
  "How does the commit–reveal fairness model work?",
  "Explain the risk of copying a trader.",
] as const;

const KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    match: /sentiment|bullish|bearish|bias|gauge/i,
    body:
      "Order flow on %SYM% reads %PCT% bullish across the current window. " +
      "That gauge describes the book as it stands — it is a reading, never a forecast. " +
      "Size any position against the risk you can carry, not against the number.",
    followUps: [
      "What moves the %SYM% reading?",
      "How is the gauge calculated?",
      "Show me the fairness model",
    ],
  },
  {
    match: /price|market|volatil|chart|symbol|candle|indicator/i,
    body:
      "Every product on this desk is an OTC instrument priced by our own engine, so %SYM% quotes come from the engine rather than a public exchange feed. " +
      "Open the live chart to read candles, indicators and the current payout together.",
    followUps: [
      "What is the sentiment on %SYM%?",
      "How are payouts set?",
      "Where do I see live metrics?",
    ],
  },
  {
    match: /fair|seed|hash|provab|commit|random|verif/i,
    body:
      "Settlement uses a commit–reveal scheme: the server publishes the SHA-256 hash of its secret seed before the round, every draw is derived from " +
      "server seed + client seed + nonce, and the server seed is revealed afterwards so you can recompute the hash yourself. " +
      "The verifier on this page runs that check in your browser. It proves the settlement was not altered — it does not predict a trading outcome.",
    followUps: [
      "Walk me through the verifier",
      "What is a client seed?",
      "Does fairness cover returns?",
    ],
  },
  {
    match: /copy|trader|leader|mirror|follow(ing)?/i,
    body:
      "Copying mirrors another trader’s positions — including their losing ones — at the size you allocate, and you can pause at any time without closing what you already hold. " +
      "Rankings publish from settled trades only, never from a single lucky fill, and past performance is not indicative of future results.",
    followUps: [
      "What can I cap per trade?",
      "How are leaders ranked?",
      "What are the copy-trading risks?",
    ],
  },
  {
    match: /deposit|withdraw|wallet|payment|balance|fund/i,
    body:
      "Deposits and withdrawals are handled from the wallet, with every request listed alongside its status in your account history. " +
      "Nothing here changes a balance until the transaction is confirmed, so you never trade against an unconfirmed credit.",
    followUps: [
      "Which payment methods are supported?",
      "How long do withdrawals take?",
      "Are there deposit fees?",
    ],
  },
  {
    match: /payout|win rate|return|profit|roi/i,
    body:
      "A payout is the multiple a winning contract settles at, and it moves with live market conditions instead of sitting frozen. " +
      "A higher payout reflects a lower implied probability of winning — it is never a promise of profit.",
    followUps: [
      "How are payouts calculated?",
      "Where can I see live rates?",
      "Explain the risk of trading",
    ],
  },
  {
    match: /account|kyc|sign ?up|register|log ?in|password|session/i,
    body: "Create an account with an email and password; verification unlocks withdrawals, and the session is held in an httpOnly cookie you can revoke by signing out.",
    followUps: [
      "How do I verify my account?",
      "How do I reset my password?",
      "Is my data private?",
    ],
  },
  {
    match: /start|begin|guide|first|how.*(trade|work)|platform/i,
    body:
      "Start by opening the live chart, pick a market from the catalogue, choose an expiry and a stake, then place the ticket. " +
      "A first trade reads best at practice sizing while you learn how the expiries settle.",
    followUps: ["What is a good first market?", "How do expiries work?", "What are the risks?"],
  },
  {
    match: /^(hi|hey|hello|yo)\b|good (morning|afternoon|evening)/i,
    body: "Hello — I’m %NAME%. I can walk you through a live market, the commit–reveal fairness model, deposits and withdrawals, payouts, or the risks of copy trading.",
    followUps: [
      "What is the sentiment on BTCUSD?",
      "How does the fairness model work?",
      "What are the risks of copy trading?",
    ],
  },
];

const FALLBACK_REPLY =
  "I can cover a live market, the commit–reveal fairness model, deposits and withdrawals, payouts, or the risks of copy trading — ask about any of them.";

const FALLBACK_FOLLOW_UPS = STARTING_PROMPTS;

function entryFor(prompt: string): KnowledgeEntry | undefined {
  return KNOWLEDGE.find((entry) => entry.match.test(prompt));
}

/** Deterministic pseudo-sentiment so the same symbol always reads the same. */
function sentimentPct(symbol: string): number {
  if (symbol === "BTCUSD") return BTCUSD_SENTIMENT_PCT;
  let hash = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 31 + symbol.charCodeAt(index)) % 1000;
  }
  return 52 + (hash % 35);
}

function resolve(template: string, symbol: string): string {
  return template
    .replace(/%SYM%/g, symbol)
    .replace(/%PCT%/g, `${sentimentPct(symbol)}%`)
    .replace(/%NAME%/g, BRAND.assistantName);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    window.setTimeout(resolveDelay, ms);
  });
}

export function createMockAIAssistantProvider(): AIAssistantProvider {
  return {
    id: "tradeon-assistant",
    name: BRAND.assistantName,
    source: "demo",

    suggestedPrompts: () => STARTING_PROMPTS,

    followUps: (prompt, context) => {
      const symbol = context?.symbol ?? "BTCUSD";
      const entry = entryFor(prompt);
      return (entry ? entry.followUps : FALLBACK_FOLLOW_UPS).map((item) => resolve(item, symbol));
    },

    async getSentiment(symbol: string): Promise<SentimentReading> {
      await delay(LATENCY_MS);
      const pct = sentimentPct(symbol);
      return {
        symbol,
        bullishPct: pct,
        confidence: 0.5 + (pct % 10) / 25,
        summary: `${pct}% bullish on ${symbol}`,
        generatedAt: new Date().toISOString(),
        source: "demo",
      };
    },

    async *ask(prompt: string, context?: { symbol?: string }): AsyncIterable<string> {
      await delay(FIRST_TOKEN_MS);
      const symbol = context?.symbol ?? "BTCUSD";
      const entry = entryFor(prompt);
      const words = resolve(entry ? entry.body : FALLBACK_REPLY, symbol).split(" ");
      // A few words per tick keeps the reply readable yet finishes in well under
      // a second on a visible tab (background tabs throttle timers).
      for (let index = 0; index < words.length; index += WORDS_PER_CHUNK) {
        await delay(STREAM_CHUNK_MS);
        const chunk = words.slice(index, index + WORDS_PER_CHUNK).join(" ");
        yield index === 0 ? chunk : ` ${chunk}`;
      }
    },
  };
}
