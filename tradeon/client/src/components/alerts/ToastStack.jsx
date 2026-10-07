/**
 * ToastStack — 1:1 port of legacy src/components/alerts/ToastStack.jsx.
 * Top-CENTER toast stack, newest on top, capped at 3. Auto-dismiss per
 * severity with hover-to-pause + manual close.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { useAlertStore } from '@/lib/useAlertStore';

const ICONS = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export default function ToastStack() {
  const toasts = useAlertStore((s) => s.toasts);
  const dismissToast = useAlertStore((s) => s.dismissToast);

  return (
    <div className="nx-toast-stack" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastRow({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const startedAt = useRef(Date.now());
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (paused) {
      remaining.current -= Date.now() - startedAt.current;
      return undefined;
    }
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismissRef.current(), Math.max(400, remaining.current));
    return () => clearTimeout(timer);
  }, [paused]);

  const Icon = ICONS[toast.severity] || Info;

  return (
    <motion.div
      layout
      role={toast.severity === 'critical' || toast.severity === 'warning' ? 'alert' : 'status'}
      className={`nx-toast nx-toast-${toast.severity}`}
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon size={16} className="nx-toast-icon" />
      <div className="nx-toast-body">
        {toast.title && <strong className="nx-toast-title">{toast.title}</strong>}
        <span className="nx-toast-msg">{toast.message}</span>
      </div>
      <button type="button" className="nx-toast-x" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
      <i className="nx-toast-bar" style={{ animationDuration: `${toast.durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
    </motion.div>
  );
}
