import { useReducedMotion } from 'framer-motion';
import { Suspense, lazy } from 'react';

/**
 * Fixed deep-space backdrop: static gradient first (always painted), animated
 * canvas lazily loaded on top. Reduced motion users, and anyone whose browser
 * never resolves the lazy chunk, simply keep the static gradient.
 */
const AmbientCanvas = lazy(() => import('./AmbientCanvas'));

export default function SpatialBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="apex-space pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {reduceMotion ? null : (
        <Suspense fallback={null}>
          <AmbientCanvas />
        </Suspense>
      )}
      {/* Vignette keeps the centre content readable over any glow. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,transparent_35%,rgba(5,5,5,0.72)_100%)]" />
    </div>
  );
}
