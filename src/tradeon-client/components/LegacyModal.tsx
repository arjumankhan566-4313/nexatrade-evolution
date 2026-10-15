/**
 * LegacyModal — modal system, 1:1 port of legacy openModal/closeModal.
 * Mount once in the app root; control via openLegacyModal / closeLegacyModal.
 */
import { useEffect, useState, type ReactNode } from "react";
import "../styles/legacy-pages.css";

let modalContent: ReactNode | null = null;
let modalSeq = 0;
let modalKey = 0;
const listeners = new Set<() => void>();

export function openLegacyModal(content: ReactNode): void {
  modalContent = content;
  modalKey = ++modalSeq;
  listeners.forEach((fn) => fn());
}

export function closeLegacyModal(): void {
  modalContent = null;
  listeners.forEach((fn) => fn());
}

export default function LegacyModal() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLegacyModal();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      listeners.delete(fn);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!modalContent) return null;
  return (
    <div className="lp-modal-overlay" onClick={closeLegacyModal}>
      <div className="lp-modal" onClick={(e) => e.stopPropagation()} key={modalKey}>
        {modalContent}
      </div>
    </div>
  );
}
