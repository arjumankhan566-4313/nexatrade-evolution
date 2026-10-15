/**
 * LegacyToast — toast container, 1:1 port of legacy toast system.
 * Mount once in the app root.
 */
import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "../lib/legacy";
import "../styles/legacy-pages.css";

export default function LegacyToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  if (!toasts.length) return null;
  return (
    <div className="lp-toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`lp-toast ${t.type === "success" ? "success" : t.type === "error" ? "error" : t.type === "warning" ? "warning" : ""}`}
        >
          <div className="t-title">{t.title}</div>
          {t.body && <div className="t-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
