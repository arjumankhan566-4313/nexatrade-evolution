// @ts-nocheck
/**
 * LegacyModalHost — renders the current blocking modal (the `alert.modal`
 * channel of the `useAlertStore` shim). Mount once near the app root.
 *
 * Kept as its own component module (not inside `lib/legacyInfra`) so Vite can
 * treat both as Fast Refresh boundaries; see `WorkspaceLink.tsx`.
 */
import { useEffect, useState } from 'react';
import { dismissModal, getModal, subscribeModal } from '../../lib/legacyInfra';

export default function LegacyModalHost() {
  const [modal, setModal] = useState(getModal());
  useEffect(() => subscribeModal(setModal), []);
  if (!modal) return null;
  return (
    <div className="lp-modal-overlay" onClick={() => { if (modal.dismissible) dismissModal(); }}>
      <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{modal.title}</h3>
        {modal.message && <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{modal.message}</p>}
        <button
          className="btn btn-gold btn-block"
          style={{ marginTop: 18 }}
          onClick={() => { dismissModal(); modal.onConfirm?.(); }}
        >
          {modal.confirmLabel || 'OK'}
        </button>
      </div>
    </div>
  );
}
