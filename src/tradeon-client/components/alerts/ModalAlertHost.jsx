/**
 * ModalAlertHost — 1:1 port of legacy src/components/alerts/ModalAlertHost.jsx.
 * Blocking Center Modal — dead center of the screen, dimmed + blurred backdrop.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ShieldAlert, Info, CheckCircle2, X } from 'lucide-react';
import { useAlertStore } from '@/tradeon-client/lib/useAlertStore';

const ICONS = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export default function ModalAlertHost() {
  const modal = useAlertStore((s) => s.modal);
  const closeModal = useAlertStore((s) => s.closeModal);
  const confirmRef = useRef(null);

  const cancel = () => {
    if (!modal) return;
    modal.onCancel?.();
    closeModal();
  };
  const confirm = () => {
    if (!modal) return;
    closeModal();
    modal.onConfirm?.();
  };

  useEffect(() => {
    if (!modal) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && modal.dismissible) cancel();
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => confirmRef.current?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.id]);

  const Icon = ICONS[modal?.severity] || AlertTriangle;
  const tone = modal?.severity === 'critical' ? 'critical' : modal?.severity === 'success' ? 'success' : modal?.severity === 'info' ? 'info' : 'warning';

  return (
    <AnimatePresence>
      {modal && (
        <motion.div
          key={modal.id}
          className="nx-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && modal.dismissible) cancel();
          }}
          role="presentation"
        >
          <motion.div
            className={`nx-modal nx-modal-${tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="nx-modal-title"
            aria-describedby="nx-modal-desc"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {modal.dismissible && (
              <button type="button" className="nx-modal-x" onClick={cancel} aria-label="Close">
                <X size={18} />
              </button>
            )}

            <span className={`nx-modal-icon nx-modal-icon-${tone}`}>
              <Icon size={30} strokeWidth={1.9} />
            </span>

            <h3 id="nx-modal-title" className="nx-modal-title">{modal.title}</h3>
            {modal.message && <p id="nx-modal-desc" className="nx-modal-msg">{modal.message}</p>}

            <div className="nx-modal-actions">
              {modal.cancelLabel && (
                <button type="button" className="nx-btn nx-btn-ghost" onClick={cancel}>
                  {modal.cancelLabel}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                className={`nx-btn ${tone === 'critical' ? 'nx-btn-crimson' : 'nx-btn-gold'}`}
                onClick={confirm}
              >
                {modal.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
