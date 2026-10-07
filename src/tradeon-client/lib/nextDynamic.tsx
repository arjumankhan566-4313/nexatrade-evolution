// @ts-nocheck
/**
 * next/dynamic shim — Vite-compatible replacement for Next.js dynamic import.
 * Uses React.lazy + Suspense to lazy-load a component module, matching the
 * legacy `dynamic(() => import(...), { ssr, loading })` signature.
 */
import React, { Suspense, lazy } from 'react';

export default function dynamic(loader, opts = {}) {
  const Lazy = lazy(loader);
  return function DynamicComponent(props) {
    return React.createElement(
      Suspense,
      { fallback: opts.loading ? opts.loading() : null },
      React.createElement(Lazy, props),
    );
  };
}
