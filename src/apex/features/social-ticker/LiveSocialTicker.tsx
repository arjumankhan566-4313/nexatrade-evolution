import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { DEMO_MODE } from "../../config/content.config";
import {
  createTickerEvent,
  randomDelayMs,
  toTickerEvent,
  type SocialActivityPayload,
  type TickerEvent,
  type TickerEventKind,
} from "./events";

/** How long a toast stays on screen before it fades out. */
const HOLD_MS = 5200;
/** The very first toast appears sooner so the surface feels alive immediately. */
const FIRST_DELAY_MS = 2400;
/** Real-activity socket channel used when DEMO_MODE is false. */
const ACTIVITY_EVENT = "social:activity";

type KindStyle = {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Icon badge fill + tint. */
  badge: string;
  /** Accent used for the value and the pulse dot. */
  accent: string;
};

const KIND_STYLE: Record<TickerEventKind, KindStyle> = {
  profit: {
    Icon: TrendingUp,
    badge: "bg-apex-lime/12 text-apex-lime ring-apex-lime/25",
    accent: "text-apex-lime",
  },
  deposit: {
    Icon: Wallet,
    badge: "bg-apex-cyan/12 text-apex-cyan ring-apex-cyan/25",
    accent: "text-apex-cyan",
  },
  withdrawal: {
    Icon: ArrowUpRight,
    badge: "bg-white/10 text-white ring-white/20",
    accent: "text-apex-ink",
  },
};

/**
 * Live social FOMO ticker — glass toasts that slide in from the bottom-left
 * edge, hold for a few seconds and fade away.
 *
 * DEMO_MODE true  → fabricates realistic activity (masked handles, non-round
 *                   amounts, an irregular 4–15s cadence — never a fixed interval).
 * DEMO_MODE false → listens for real `social:activity` socket messages.
 *
 * Purely presentational: it never intercepts pointer events, so the landing
 * layout and the canvas chart underneath are untouched.
 */
export default function LiveSocialTicker() {
  const reduceMotion = useReducedMotion();
  const [event, setEvent] = useState<TickerEvent | null>(null);

  useEffect(() => {
    if (!DEMO_MODE) return;
    let cancelled = false;
    let timer: number | undefined;
    let first = true;

    const cycle = () => {
      if (cancelled) return;
      timer = window.setTimeout(
        () => {
          if (cancelled) return;
          setEvent(createTickerEvent());
          timer = window.setTimeout(() => {
            if (cancelled) return;
            setEvent(null);
            first = false;
            cycle();
          }, HOLD_MS);
        },
        first ? FIRST_DELAY_MS : randomDelayMs(),
      );
    };

    cycle();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    let hideTimer: number | undefined;
    let detach: (() => void) | undefined;

    // Loaded lazily so the demo landing never opens a socket connection.
    void import("../../../lib/socket").then(({ socket }) => {
      if (cancelled) return;
      const onActivity = (payload: SocialActivityPayload) => {
        const next = toTickerEvent(payload);
        if (!next) return;
        setEvent(next);
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setEvent(null), HOLD_MS);
      };
      socket.on(ACTIVITY_EVENT, onActivity);
      detach = () => socket.off(ACTIVITY_EVENT, onActivity);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(hideTimer);
      detach?.();
    };
  }, []);

  const style = event ? KIND_STYLE[event.kind] : null;
  const Icon = style?.Icon;

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed bottom-20 left-4 z-50 sm:bottom-7 sm:left-7"
    >
      <AnimatePresence mode="wait">
        {event && Icon && style ? (
          <motion.div
            key={event.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -28, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20, scale: 0.97 }}
            transition={
              reduceMotion
                ? { duration: 0.25 }
                : { type: "spring", stiffness: 320, damping: 30, mass: 0.7 }
            }
            className="apex-glass apex-glass--strong apex-hairline flex w-[min(92vw,23rem)] items-center gap-3 rounded-2xl py-3 pl-3 pr-4"
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-inset ${style.badge}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-apex text-[13px] leading-snug text-apex-ink">
                <span className="font-semibold">{event.mask}</span>{" "}
                <span className="text-apex-muted">{event.action}</span>{" "}
                <span className={`font-semibold ${style.accent}`}>{event.value}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-apex-faint">
                <span
                  className={`h-1.5 w-1.5 animate-pulse rounded-full bg-current ${style.accent}`}
                />
                Just now
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
