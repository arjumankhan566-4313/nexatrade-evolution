/**
 * AdminSupportPage — Support ticket management.
 * List, view, reply to and close support tickets. Backend: /api/admin/tickets.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, fmtDate, timeAgo } from "@/tradeon-client/lib/apiClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

export default function AdminSupportPage() {
  const [status, setStatus] = useState("OPEN");
  const [tickets, setTickets] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({ open: 0, answered: 0, closed: 0 });
  const [active, setActive] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (s: string) => {
    try {
      const qs = s === "ALL" ? "" : `?status=${s}`;
      const d: any = await api(`/api/admin/tickets${qs}`);
      setTickets(d.tickets || []);
      setCounts(d.counts || { open: 0, answered: 0, closed: 0 });
    } catch (err: any) {
      alert.critical(err.message, { title: "Tickets unavailable" });
    }
  }, []);

  useEffect(() => {
    load(status);
    const t = setInterval(() => load(status), 15000);
    return () => clearInterval(t);
  }, [status, load]);

  useLiveEvents({ scope: "admin", onEvent: () => load(status) });

  const openTicket = async (id: string) => {
    setActive(id);
    try {
      const d: any = await api(`/api/admin/tickets/${id}`);
      setDetail(d);
    } catch (err: any) {
      alert.critical(err.message, { title: "Ticket detail unavailable" });
    }
  };

  const sendReply = async (close: boolean) => {
    if (!active) return;
    if (!close && reply.trim().length < 2) {
      alert.info("Reply message too short.", { log: false });
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/tickets/${active}/reply`, {
        method: "POST",
        body: { message: reply.trim(), close },
      });
      alert.success(close ? "Ticket closed." : "Reply sent.");
      setReply("");
      await openTicket(active);
      await load(status);
    } catch (err: any) {
      alert.critical(err.message, { title: "Reply NOT sent" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-support">
      <PageHeader
        eyebrow="Customer service"
        title="Support"
        highlight="Tickets"
        subtitle="User inquiries & help desk"
      />

      <div className="support-stats">
        <div className="glass support-stat">
          <span>Open</span>
          <strong className="down">{counts.open}</strong>
        </div>
        <div className="glass support-stat">
          <span>Answered</span>
          <strong className="up">{counts.answered}</strong>
        </div>
        <div className="glass support-stat">
          <span>Closed</span>
          <strong>{counts.closed}</strong>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["OPEN", "ANSWERED", "CLOSED", "ALL"].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${status === s ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="support-split">
        <aside className="glass support-list">
          {tickets.map((t: any) => (
            <button
              key={t.id}
              className={`support-ticket ${active === t.id ? "active" : ""}`}
              onClick={() => openTicket(t.id)}
            >
              <div className="row-between">
                <strong>{t.subject}</strong>
                <span
                  className={`badge ${t.status === "OPEN" ? "badge-down" : t.status === "ANSWERED" ? "badge-up" : ""}`}
                >
                  {t.status}
                </span>
              </div>
              <span className="dim">
                {t.full_name} · {t.email}
              </span>
              <span className="dim">
                {t.category} · {t.reply_count} replies · {timeAgo(t.updatedAt || t.updated_at)}
              </span>
            </button>
          ))}
          {!tickets.length && <div className="empty">No tickets in this queue.</div>}
        </aside>

        {active && detail ? (
          <section className="glass support-detail" key={active}>
            <div className="row-between" style={{ flexWrap: "wrap", gap: 10 }}>
              <div>
                <h3>{detail.ticket.subject}</h3>
                <p className="dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                  {detail.ticket.full_name} · {detail.ticket.email} ·{" "}
                  {fmtDate(detail.ticket.createdAt || detail.ticket.created_at)}
                </p>
              </div>
              <span
                className={`badge ${detail.ticket.status === "OPEN" ? "badge-down" : detail.ticket.status === "ANSWERED" ? "badge-up" : ""}`}
              >
                {detail.ticket.status}
              </span>
            </div>

            <div className="support-replies">
              {detail.replies.map((r: any) => (
                <div key={r.id} className={`support-msg ${r.is_admin ? "admin" : "user"}`}>
                  <div className="support-msg-head">
                    <strong>{r.is_admin ? "Support" : detail.ticket.full_name}</strong>
                    <span className="dim">{fmtDate(r.createdAt || r.created_at)}</span>
                  </div>
                  <p>{r.message}</p>
                </div>
              ))}
              {!detail.replies.length && (
                <div className="empty">No replies yet — be the first to respond.</div>
              )}
            </div>

            {detail.ticket.status !== "CLOSED" && (
              <div className="support-reply-area">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Type your reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button
                    className="btn btn-gold"
                    disabled={busy || reply.trim().length < 2}
                    onClick={() => sendReply(false)}
                  >
                    Send reply
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => sendReply(true)}>
                    Send & close
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="glass support-detail">
            <div className="empty">Select a ticket to view.</div>
          </section>
        )}
      </div>
    </div>
  );
}
