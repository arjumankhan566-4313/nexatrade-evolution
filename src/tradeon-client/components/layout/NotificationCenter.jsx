/**
 * NotificationCenter — 1:1 port of legacy src/components/layout/NotificationCenter.jsx.
 * The permanent record: every alert also lands here for later review.
 * Dropdown from the topbar bell, closes on click-outside / Escape, per-item
 * dismiss, "Mark all read" / "Clear all".
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, X, ShieldAlert, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { timeAgo } from "@/tradeon-client/lib/apiClient";

const ICONS = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export default function NotificationCenter({
  items = [],
  onDismiss,
  onMarkAllRead,
  onClearAll,
  onOpen = () => {},
  align = "right",
  size = 18,
  buttonClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const unreadCount = items.filter((i) => !i.read).length;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((v) => {
      if (!v) onOpen?.();
      return !v;
    });
  };

  return (
    <div ref={rootRef} className="nx-bell">
      <button
        type="button"
        className={`nx-bell-btn ${buttonClassName}`}
        onClick={toggle}
        aria-label={unreadCount ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={size} />
        {unreadCount > 0 && (
          <span className="nx-bell-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={`nx-bell-panel ${align === "left" ? "nx-bell-left" : ""}`}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16 }}
          >
            <div className="nx-bell-head">
              <span className="nx-bell-title">
                Notifications{unreadCount > 0 && <em>{unreadCount} new</em>}
              </span>
              <div className="nx-bell-tools">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={!unreadCount}
                  className="nx-bell-tool nx-bell-tool-primary"
                >
                  <Check size={12} /> Mark all read
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={!items.length}
                  className="nx-bell-tool"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="nx-bell-close"
                  aria-label="Close notifications"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="nx-bell-list">
              {items.length === 0 && <p className="nx-bell-empty">No notifications</p>}
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const Icon = ICONS[item.severity] || Info;
                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0, x: 24 }}
                      transition={{ duration: 0.16 }}
                      className={`nx-note nx-note-${item.severity} ${item.read ? "" : "nx-note-unread"}`}
                    >
                      <span className="nx-note-dot" aria-hidden="true" />
                      <Icon size={14} className="nx-note-icon" />
                      <div className="nx-note-body">
                        {item.title && <strong>{item.title}</strong>}
                        {item.message && <p>{item.message}</p>}
                        <span className="nx-note-time">
                          {item.timestamp ? timeAgo(item.timestamp) : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="nx-note-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss?.(item.id);
                        }}
                        aria-label="Dismiss notification"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
