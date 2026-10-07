import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Dev-only: where the Vite dev server proxies /api and /socket.io.
// Defaults to localhost for bare-metal dev; the sandbox compose sets
// VITE_PROXY_TARGET=http://v2-api:4000.
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000';
// Serve the original bundled artwork directly; no legacy server is needed.
const publicDir = process.env.VITE_PUBLIC_DIR ?? path.resolve(__dirname, '../../public');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir,
  resolve: {
    alias: {
      // Mirror the legacy Next.js `@/` → `src/` path alias so ported pages
      // can keep their `@/lib/...` / `@/components/...` imports verbatim.
      '@': path.resolve(__dirname, './src'),
      // Next.js `next/dynamic` lazy-loader → a Vite-compatible Suspense shim.
      'next/dynamic': path.resolve(__dirname, './src/lib/nextDynamic.tsx'),
      // Next.js `next/link` → react-router Link wrapper (maps href → to).
      'next/link': path.resolve(__dirname, './src/lib/nextLink.tsx'),
      // Next.js `next/navigation` → react-router equivalents.
      'next/navigation': path.resolve(__dirname, './src/lib/nextNavigation.ts'),
    },
  },
  server: {
    host: true, // bind 0.0.0.0 — required inside containers / behind proxies
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
});
