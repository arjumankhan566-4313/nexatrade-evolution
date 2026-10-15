/**
 * Client-side RUM (Real-User Monitoring) collector.
 *
 * Uses native browser Performance APIs to collect:
 *   • Navigation Timing: TTFB, full page load
 *   • Paint Timing: FCP, LCP
 *   • Layout Instability: CLS
 *   • Interaction: INP
 *   • SPA route transitions (History API)
 *   • Canvas FPS (requestAnimationFrame sampling)
 *   • Resource Timing: bundle/chunk load times
 *
 * Data is batched and sent via navigator.sendBeacon with 1-in-N sampling
 * to keep overhead tiny. No personal data — only performance metrics.
 */

const SAMPLE_RATE = 1; // 1 = 100% in dev; set to 0.1 for production
const BATCH_INTERVAL = 5000; // flush every 5s
const RUM_ENDPOINT = "/api/performance/rum";

type MetricPayload = {
  panel: "admin" | "user";
  page: string;
  metrics: {
    ttfb?: number;
    fcp?: number;
    lcp?: number;
    inp?: number;
    cls?: number;
    loadTime?: number;
    routeTransition?: number;
    bundleLoadTime?: number;
    bundleSize?: number;
    fps?: number;
    deviceType: string;
    networkType: string;
  };
};

let batch: MetricPayload[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let panel: "admin" | "user" = "user";
let routeTransitionStart = 0;
let lastRoute = "";

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

function getNetworkType(): string {
  const conn = (navigator as any).connection || (navigator as any).mozConnection;
  return conn?.effectiveType || "unknown";
}

function shouldSample(): boolean {
  return Math.random() < SAMPLE_RATE;
}

function flush() {
  if (batch.length === 0) return;
  const payload = batch;
  batch = [];
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(RUM_ENDPOINT, blob);
    } else {
      fetch(RUM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* silent — monitoring must never break the app */
  }
}

function sendMetric(m: MetricPayload) {
  batch.push(m);
  if (batch.length >= 10) flush();
}

// ── Initialize RUM for a panel ──
export function initPerfMonitor(currentPanel: "admin" | "user") {
  panel = currentPanel;
  lastRoute = window.location.pathname;

  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flush, BATCH_INTERVAL);

  // Flush on page unload
  window.addEventListener("pagehide", flush);

  // ── Navigation Timing (initial page load) ──
  if (shouldSample()) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const navEntries = performance.getEntriesByType(
          "navigation",
        ) as PerformanceNavigationTiming[];
        if (navEntries.length) {
          const nav = navEntries[0];
          const ttfb = nav.responseStart - nav.requestStart;
          if (ttfb > 0) {
            sendMetric({
              panel,
              page: window.location.pathname,
              metrics: {
                ttfb: Math.round(ttfb),
                loadTime: Math.round(nav.loadEventEnd - nav.startTime),
                deviceType: getDeviceType(),
                networkType: getNetworkType(),
              },
            });
          }
        }
      }, 100);
    });
  }

  // ── Paint Timing (FCP, LCP) ──
  let lcpValue = 0;
  const lcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "largest-contentful-paint") {
        lcpValue = Math.round(entry.startTime);
      }
    }
  });
  try {
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* LCP not supported by this browser */
  }

  const fcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "paint" && entry.name === "first-contentful-paint") {
        if (shouldSample()) {
          sendMetric({
            panel,
            page: window.location.pathname,
            metrics: {
              fcp: Math.round(entry.startTime),
              lcp: lcpValue || undefined,
              deviceType: getDeviceType(),
              networkType: getNetworkType(),
            },
          });
        }
      }
    }
  });
  try {
    fcpObserver.observe({ type: "paint", buffered: true });
  } catch {
    /* paint timing not supported by this browser */
  }

  // LCP final value on page hide
  window.addEventListener("pagehide", () => {
    if (lcpValue > 0 && shouldSample()) {
      sendMetric({
        panel,
        page: window.location.pathname,
        metrics: {
          lcp: lcpValue,
          deviceType: getDeviceType(),
          networkType: getNetworkType(),
        },
      });
    }
  });

  // ── Layout Instability (CLS) ──
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as any) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }
  });
  try {
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* layout-shift not supported by this browser */
  }

  // ── Interaction (INP) ──
  let maxInp = 0;
  const inpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as any) {
      const duration = entry.duration || entry.processingEnd - entry.startTime;
      if (duration > maxInp) maxInp = duration;
    }
  });
  try {
    inpObserver.observe({ type: "event", buffered: true });
  } catch {
    /* event timing not supported by this browser */
  }

  // Send CLS + INP on pagehide
  window.addEventListener("pagehide", () => {
    if ((clsValue > 0 || maxInp > 0) && shouldSample()) {
      sendMetric({
        panel,
        page: window.location.pathname,
        metrics: {
          cls: Math.round(clsValue * 1000) / 1000,
          inp: Math.round(maxInp),
          deviceType: getDeviceType(),
          networkType: getNetworkType(),
        },
      });
    }
  });

  // ── SPA route transitions ──
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    routeTransitionStart = performance.now();
    return origPushState.apply(history, args);
  };
  history.replaceState = function (...args) {
    routeTransitionStart = performance.now();
    return origReplaceState.apply(history, args);
  };
  window.addEventListener("popstate", () => {
    routeTransitionStart = performance.now();
  });

  // Observe DOM mutations after route change to measure transition time
  let transitionSent = false;
  const routeObserver = new MutationObserver(() => {
    if (routeTransitionStart > 0 && !transitionSent) {
      const duration = performance.now() - routeTransitionStart;
      if (duration > 10) {
        transitionSent = true;
        if (shouldSample()) {
          sendMetric({
            panel,
            page: window.location.pathname,
            metrics: {
              routeTransition: Math.round(duration),
              deviceType: getDeviceType(),
              networkType: getNetworkType(),
            },
          });
        }
        setTimeout(() => {
          transitionSent = false;
          routeTransitionStart = 0;
        }, 500);
      }
    }
  });
  routeObserver.observe(document.body, { childList: true, subtree: true });
}

// ── Canvas FPS measurement ──
let fpsActive = false;
let fpsFrames = 0;
let fpsStart = 0;

export function startFpsMonitor() {
  if (fpsActive) return;
  fpsActive = true;
  fpsFrames = 0;
  fpsStart = performance.now();

  function tick() {
    if (!fpsActive) return;
    fpsFrames++;
    const elapsed = performance.now() - fpsStart;
    if (elapsed >= 2000) {
      // sample every 2s
      const fps = Math.round((fpsFrames / elapsed) * 1000);
      if (shouldSample()) {
        sendMetric({
          panel,
          page: window.location.pathname,
          metrics: {
            fps,
            deviceType: getDeviceType(),
            networkType: getNetworkType(),
          },
        });
      }
      fpsFrames = 0;
      fpsStart = performance.now();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function stopFpsMonitor() {
  fpsActive = false;
}
