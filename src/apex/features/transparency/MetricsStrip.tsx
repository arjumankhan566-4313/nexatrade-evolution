import { ErrorState, Skeleton } from '../../components/primitives';
import { useResource } from '../../hooks/useResource';
import { metricsProvider } from '../../providers';
import type { MetricSample } from '../../providers/types';

/**
 * Feature 4 — system metrics.
 *
 * Values come from a MetricsProvider and nothing else. Until a collector
 * supplies a number the tiles read "—"; the moment one does, it renders with no
 * UI change and no estimated figure is ever shown.
 *
 * The strip is rendered inside the fairness section's right column (~500px on
 * desktop), so it stays a two-column grid. Four columns there squeezed each
 * tile below the width of its own label and a grouped counter like "4,595,488"
 * spilled out of the card. Tiles also wrap long values rather than overflowing.
 */

function formatValue(sample: MetricSample): string {
  if (sample.value === null) return '—';
  // Grouped thousands keep a large counter readable at tile size.
  return sample.value.toLocaleString('en-US', {
    minimumFractionDigits: sample.precision,
    maximumFractionDigits: sample.precision,
  });
}

/** Short local clock time — a raw ISO stamp is unreadable at tile size. */
function formatMeasuredAt(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MetricTile({ sample }: { sample: MetricSample }) {
  const unmeasured = sample.value === null;

  return (
    <div className="apex-glass apex-hairline min-w-0 p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 break-words text-[11px] font-semibold uppercase leading-tight tracking-[0.16em] text-apex-faint">
          {sample.label}
        </span>
      </div>
      <p className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-apex">
        <span
          className={`min-w-0 break-words text-xl font-semibold tabular-nums sm:text-2xl ${
            unmeasured ? 'text-apex-faint' : 'text-apex-ink'
          }`}
          title={unmeasured ? 'Not measured yet' : undefined}
        >
          {formatValue(sample)}
        </span>
        {unmeasured ? null : <span className="text-xs text-apex-muted">{sample.unit}</span>}
      </p>
      <p className="mt-1 text-[11px] text-apex-faint">
        {unmeasured
          ? 'Awaiting a measurement source'
          : `Measured at ${formatMeasuredAt(sample.measuredAt)}`}
      </p>
    </div>
  );
}

export default function MetricsStrip() {
  const { data, status, error, reload } = useResource(
    () => metricsProvider.getSystemMetrics(),
    metricsProvider.id
  );

  if (status === 'loading') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="apex-glass apex-hairline min-w-0 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-6 w-16" />
            <Skeleton className="mt-3 h-2.5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Metrics unavailable"
        description={error ?? 'The metrics provider did not respond.'}
        actionLabel="Retry"
        onAction={reload}
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(data ?? []).map((sample) => (
          <MetricTile key={sample.id} sample={sample} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-apex-faint">
        Read live from the running engine. A value the API does not report stays blank rather than
        being estimated.
      </p>
    </div>
  );
}
