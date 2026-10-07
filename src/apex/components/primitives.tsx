import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef } from 'react';

/** Spatial UI primitives shared by every Apex feature. */

const TILT_MAX_DEG = 6;
const TILT_PERSPECTIVE = 900;
const TILT_SPRING = { stiffness: 150, damping: 18, mass: 0.6 } as const;

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  /** Denser fill for panels that must stay readable over busy backdrops. */
  strong?: boolean;
  /** Soft depth shadow. Disable on nested cards to keep the stack shallow. */
  depth?: boolean;
};

export function GlassCard({
  children,
  className = '',
  strong = false,
  depth = true,
}: GlassCardProps) {
  return (
    <div
      className={`apex-glass apex-hairline ${strong ? 'apex-glass--strong' : ''} ${
        depth ? '' : '[box-shadow:none]'
      } ${className}`}
    >
      {children}
    </div>
  );
}

type TiltCardProps = {
  children: ReactNode;
  className?: string;
  /** 0 → flat, 1 → default travel, 2 → pronounced. */
  intensity?: number;
};

/**
 * Pointer-driven 3D tilt with Framer Motion spring physics. Falls back to a
 * static card when the user prefers reduced motion.
 */
export function TiltCard({ children, className = '', intensity = 1 }: TiltCardProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const max = TILT_MAX_DEG * intensity;
  const rotateX = useSpring(
    useTransform(pointerY, [0, 1], [max, -max]),
    TILT_SPRING
  );
  const rotateY = useSpring(
    useTransform(pointerX, [0, 1], [-max, max]),
    TILT_SPRING
  );

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    pointerX.set((event.clientX - rect.left) / rect.width);
    pointerY.set((event.clientY - rect.top) / rect.height);
  }

  function reset() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      className={`apex-tilt ${className}`}
      style={
        reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: TILT_PERSPECTIVE }
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
    </motion.div>
  );
}

type SectionShellProps = {
  id?: string;
  children: ReactNode;
  className?: string;
};

export function SectionShell({ id, children, className = '' }: SectionShellProps) {
  return (
    <section id={id} className={`relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  /** Rendered next to the eyebrow — a status note or similar. */
  aside?: ReactNode;
};

export function SectionHeading({ eyebrow, title, description, aside }: SectionHeadingProps) {
  return (
    <header className="mb-9 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-apex text-[11px] font-semibold uppercase tracking-[0.28em] text-apex-cyan/80">
          {eyebrow}
        </span>
        {aside}
      </div>
      <h2 className="mt-3 font-apex text-3xl font-semibold leading-tight text-apex-ink sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-apex-muted">{description}</p>
      ) : null}
    </header>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`apex-skeleton block ${className}`} />;
}

type StatePanelProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Empty state — used when a provider truthfully has nothing to show yet. */
export function EmptyState({ title, description, actionLabel, onAction }: StatePanelProps) {
  return (
    <div className="rounded-apex border border-dashed border-white/12 px-6 py-10 text-center">
      <p className="font-apex text-sm font-semibold text-apex-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-apex-muted">{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="apex-btn apex-btn--ghost mt-5 px-4 py-2 text-sm" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Error state — always offers a retry, never swallows the failure. */
export function ErrorState({ title, description, actionLabel, onAction }: StatePanelProps) {
  return (
    <div
      role="alert"
      className="rounded-apex border border-apex-crimson/30 bg-apex-crimson/8 px-6 py-8 text-center"
    >
      <ShieldAlert aria-hidden="true" className="mx-auto h-5 w-5 text-apex-crimson" />
      <p className="mt-3 font-apex text-sm font-semibold text-apex-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-apex-muted">{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="apex-btn apex-btn--ghost mt-5 px-4 py-2 text-sm" onClick={onAction}>
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Risk / honesty note. Required beside trading stats, AI output and copy trading. */
export function Disclaimer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-apex-faint ${className}`}>{children}</p>
  );
}
