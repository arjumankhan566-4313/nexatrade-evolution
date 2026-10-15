// @ts-nocheck

import Link from "@/tradeon-client/components/dashboard/WorkspaceLink";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  Zap,
  ReceiptText,
  CreditCard,
  Smartphone,
  Landmark,
  Bitcoin,
  FileUp,
  X,
  Check,
  Copy,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "@/tradeon-client/components/dashboard/SessionProvider";
import { api, money, fmtDate } from "@/tradeon-client/lib/apiClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";

const STATUS_CLASS = {
  PENDING: "badge badge-warn",
  APPROVED: "badge badge-up",
  REJECTED: "badge badge-down",
};

const KIND_LABEL = { CRYPTO: "Crypto", LOCAL: "Local rails", BANK: "Bank", AUTO: "Automatic" };

const PAY_CURRENCY_LABEL = {
  USDT_TRC20: "USDT · Tron (TRC-20)",
  USDT_ERC20: "USDT · Ethereum (ERC-20)",
  BITCOIN: "Bitcoin (BTC)",
  ETHEREUM: "Ethereum (ETH)",
};
const payLabel = (code) =>
  PAY_CURRENCY_LABEL[code] ||
  PAY_CURRENCY_LABEL[String(code || "").toUpperCase()] ||
  code ||
  "USDT · Tron (TRC-20)";

/* Spec §6.6 — branded gateway identity (external-brand recognition) */
const RAIL_BRAND = {
  BKASH: {
    bg: "rgba(226,19,110,0.14)",
    border: "rgba(226,19,110,0.5)",
    fg: "#ff5aa2",
    label: "bKash",
  },
  NAGAD: {
    bg: "rgba(246,146,30,0.14)",
    border: "rgba(246,146,30,0.5)",
    fg: "#ffb057",
    label: "Nagad",
  },
  ROCKET: {
    bg: "rgba(138,43,226,0.14)",
    border: "rgba(138,43,226,0.5)",
    fg: "#c59bff",
    label: "Rocket",
  },
  USDT_TRC20: {
    bg: "rgba(38,161,123,0.14)",
    border: "rgba(38,161,123,0.5)",
    fg: "#4be3ae",
    label: "USDT",
  },
  USDT: {
    bg: "rgba(38,161,123,0.14)",
    border: "rgba(38,161,123,0.5)",
    fg: "#4be3ae",
    label: "USDT",
  },
  BITCOIN: {
    bg: "rgba(247,147,26,0.14)",
    border: "rgba(247,147,26,0.5)",
    fg: "#ffb057",
    label: "Bitcoin",
  },
  ETHEREUM: {
    bg: "rgba(98,126,234,0.14)",
    border: "rgba(98,126,234,0.5)",
    fg: "#a9b6ff",
    label: "Ethereum",
  },
  BANK: { bg: "rgba(30,58,95,0.3)", border: "rgba(90,130,180,0.55)", fg: "#9ec1ea", label: "Bank" },
  BINANCE_PAY: {
    bg: "rgba(243,186,47,0.14)",
    border: "rgba(243,186,47,0.55)",
    fg: "#f3ba2f",
    label: "Binance Pay",
  },
};

function KindIcon({ kind, brand }) {
  const style = brand?.fg ? { color: brand.fg } : undefined;
  const size = 18;
  switch (kind) {
    case "CRYPTO":
      return <Bitcoin size={size} style={style} />;
    case "LOCAL":
      return <Smartphone size={size} style={style} />;
    case "BANK":
      return <Landmark size={size} style={style} />;
    case "AUTO":
      return <Zap size={size} style={style} />;
    default:
      return <CreditCard size={size} style={style} />;
  }
}

function QRPlaceholder({ data, label }) {
  // Lightweight deterministic QR-like block grid (visual placeholder derived
  // from the address). Real QR bytes come from the admin-configured qrData.
  let seed = 0;
  const src = String(data || label || "nexa");
  for (let i = 0; i < src.length; i += 1) seed = (seed * 31 + src.charCodeAt(i)) >>> 0;
  const cells = [];
  let x = seed;
  for (let i = 0; i < 121; i += 1) {
    x = (x * 1103515245 + 12345) >>> 0;
    cells.push((x >> 8) & 1);
  }
  return (
    <div className="qr" role="img" aria-label={`${label} QR code`}>
      {cells.map((on, i) => (
        <i key={i} className={on ? "on" : ""} />
      ))}
    </div>
  );
}

/* Spec §6.6 — drag-and-drop deposit proof (react-dropzone) */
function ProofDropzone({ preview, onAccepted, onRemove }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxSize: 4 * 1024 * 1024,
    multiple: false,
    onDrop: (files) => files[0] && onAccepted(files[0]),
    onDropRejected: (rej) => {
      const err = rej[0]?.errors?.[0];
      // parent surfaces the message via onAccepted(null) with a flag
      onAccepted(
        null,
        err?.code === "file-too-large"
          ? "Screenshot must be under 4MB."
          : "Please upload a valid image.",
      );
    },
  });

  return (
    <div className="proof">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? "drag" : ""}`}>
        <input {...getInputProps()} />
        <FileUp size={22} style={{ color: "var(--gold-1)" }} />
        <p>{isDragActive ? "Drop the screenshot here" : "Drag & drop your payment screenshot"}</p>
        <span>or click to browse · PNG / JPG up to 4MB</span>
      </div>
      {preview && (
        <div className="proof-preview">
          <img src={preview} alt="Payment proof" />
          <div className="proof-meta">
            <span className="ok">
              <Check size={13} /> Proof attached
            </span>
            <button type="button" className="btn btn-sm btn-down" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  const { user, refresh } = useSession();
  // Preview/demo rails show only outside a production build (dev server or a
  // localhost run) — no hardcoded preview-hostnames, no process.env in the
  // browser bundle.
  const previewMode =
    !import.meta.env.PROD ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));
  const previewRails = [
    {
      code: "BINANCE_PAY",
      name: "Binance Pay",
      kind: "AUTO",
      isCrypto: true,
      address: "Binance Merchant checkout",
      instructions: "Preview checkout only. No real funds are transferred.",
    },
  ];
  const [tab, setTab] = useState("DEPOSIT");
  const [mode, setMode] = useState("MANUAL");
  const [data, setData] = useState({
    transactions: [],
    balances: { real: 0, demo: 0 },
    limits: {},
    methods: [],
    rails: [],
  });
  const [selectedRail, setSelectedRail] = useState(null);
  const [form, setForm] = useState({ amount: "", reference: "", senderAccount: "" });
  const [proof, setProof] = useState("");
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Effective gateway availability: { enabled: live, demo, autoDeposits: admin
  // master switch, liveKey: server has a real NOWPayments key, loaded } — read
  // from /api/payments/create-invoice (GET), which merges deployment env with
  // the administrator runtime switches from the admin panel.
  const [gateway, setGateway] = useState({
    enabled: false,
    demo: false,
    autoDeposits: true,
    liveKey: false,
    reason: null,
    loaded: false,
  });
  // Demo-gateway checkout (active only when no live NOWPayments key exists).
  const [checkout, setCheckout] = useState(null); // { txId, token, amount, method }
  const [paying, setPaying] = useState(false);
  const [charged, setCharged] = useState(null); // { ok:true, amount } | null
  const [chargeError, setChargeError] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState("");

  const load = useCallback(async () => {
    if (previewMode) {
      setData({
        transactions: [],
        balances: { real: 0, demo: 10000 },
        limits: { minDeposit: 10, minWithdraw: 10 },
        methods: [],
        rails: previewRails,
      });
      setWalletError("");
      setWalletLoading(false);
      return;
    }
    try {
      const walletData = await api("/api/wallet");
      setData((prev) => ({ ...prev, ...walletData, rails: walletData.rails || [] }));
      setWalletError("");
    } catch (err) {
      setWalletError(err.message || "The wallet could not be loaded.");
    } finally {
      setWalletLoading(false);
    }
  }, [previewMode]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  // Admin approvals, gateway credits and payment-method edits appear without
  // waiting for the polling fallback.
  useLiveEvents({
    onEvent: useCallback(
      (event) => {
        if (["balance", "finance", "payments", "notification"].includes(event.topic)) load();
      },
      [load],
    ),
  });

  // Gateway availability (live NOWPayments vs demo checkout) for the AUTO tab copy.
  useEffect(() => {
    api("/api/payments/create-invoice")
      .then((d) => {
        if (d?.gateway) setGateway((g) => ({ ...g, ...d.gateway, loaded: true }));
      })
      .catch(() => setGateway((g) => ({ ...g, loaded: true })));
  }, []);

  const rails = data.rails || [];
  // The gateway (AUTO) path accepts exactly these coins (NOWPayments map).
  const autoCoins = rails.filter((r) => r.code === "BINANCE_PAY");
  const selectableRails = tab === "DEPOSIT" && mode === "AUTO" ? autoCoins : rails;
  const activeRail =
    selectableRails.find((r) => r.code === selectedRail) || selectableRails[0] || null;

  useEffect(() => {
    if (selectableRails.length && !selectableRails.some((r) => r.code === selectedRail)) {
      setSelectedRail(selectableRails[0].code);
    }
  }, [selectableRails, selectedRail]);

  const brandFor = (code) => RAIL_BRAND[code] || RAIL_BRAND[String(code).toUpperCase()] || null;

  const onAccepted = (file, errMsg) => {
    if (!file) {
      if (errMsg) setMsg({ kind: "error", text: errMsg });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMsg({ kind: "error", text: "Screenshot must be under 4MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProof(String(reader.result || ""));
      setPreview(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  };

  const clearProof = () => {
    setProof("");
    setPreview("");
  };

  const copyAddress = async () => {
    if (!activeRail?.address) return;
    try {
      await navigator.clipboard.writeText(activeRail.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    /* Alert spec §1 — a withdrawal the balance cannot cover blocks the action:
       centered modal, not an inline note that is easy to miss. */
    if (
      tab === "WITHDRAWAL" &&
      Number(form.amount) > Number(user?.balanceReal ?? data.balances?.real ?? 0)
    ) {
      alert.modal({
        severity: "critical",
        title: "Insufficient balance",
        message: `Your real balance is ${money(user?.balanceReal ?? data.balances?.real)} — it doesn't cover a ${money(Number(form.amount))} withdrawal.`,
        confirmLabel: "OK",
        dismissible: true,
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (tab === "DEPOSIT" && mode === "AUTO") {
        if (activeRail?.code === "BINANCE_PAY") {
          const d = await api("/api/payments/binance/order", {
            method: "POST",
            body: { amount: Number(form.amount) },
          });
          if (d.checkoutUrl) window.location.href = d.checkoutUrl;
          else
            setMsg({
              kind: "ok",
              text: "Binance payment order created. Awaiting verified callback.",
            });
          setForm({ ...form, amount: "" });
          return;
        }
        const payCurrency = activeRail?.code;
        if (
          !payCurrency ||
          !["USDT_TRC20", "USDT_ERC20", "BITCOIN", "ETHEREUM"].includes(payCurrency)
        ) {
          throw new Error("Choose an available crypto payment method.");
        }
        const d = await api("/api/payments/create-invoice", {
          method: "POST",
          body: { amount: Number(form.amount), payCurrency },
        });
        // Live gateway → hosted NOWPayments checkout (webhook auto-credits).
        if (d?.invoiceUrl) {
          setMsg({ kind: "ok", text: "Opening the secure crypto checkout…" });
          window.location.href = d.invoiceUrl;
          return;
        }
        // No live key → in-app demo checkout that simulates the real charge.
        // The deposit is created PENDING and auto-approved only after the
        // simulated payment completes (see /api/payments/demo-charge).
        if (d?.demo && d?.checkoutToken) {
          setForm({ ...form, amount: "" });
          setCheckout({
            txId: d.txId,
            token: d.checkoutToken,
            amount: d.amount ?? Number(form.amount),
            method: payCurrency,
          });
          setCharged(null);
          setChargeError(null);
          return;
        }
        throw new Error("Could not start the automatic deposit. Please try Manual.");
      }

      await api("/api/wallet", {
        method: "POST",
        body: {
          type: tab,
          amount: Number(form.amount),
          method:
            tab === "DEPOSIT"
              ? activeRail?.code || "USDT_TRC20"
              : activeRail?.code || form.method || "USDT_TRC20",
          reference: form.reference,
          senderAccount: form.senderAccount,
          proofImage: tab === "DEPOSIT" && mode === "MANUAL" ? proof : "",
          mode: "MANUAL",
        },
      });
      const okText = `${tab === "DEPOSIT" ? "Deposit" : "Withdrawal"} request submitted — awaiting finance approval.`;
      setMsg({ kind: "ok", text: okText });
      alert.success(okText, { title: `${money(Number(form.amount))} ${tab.toLowerCase()}` });
      setForm({ amount: "", reference: "", senderAccount: "" });
      clearProof();
      load();
      refresh();
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
      if (/insufficient/i.test(err.message || "")) {
        alert.modal({
          severity: "critical",
          title: "Insufficient balance",
          message: err.message,
          confirmLabel: "OK",
          dismissible: true,
        });
      } else {
        alert.warning(err.message, { title: "Request not submitted" });
      }
    } finally {
      setBusy(false);
    }
  };

  /* ── Demo gateway checkout ─────────────────────────────────────────────
     The charge must be COMPLETED before the balance is credited: this calls
     /api/payments/demo-charge which redeems the one-time token and approves
     the PENDING deposit atomically. No form/screenshot can do that. */
  const payDemoCharge = async () => {
    if (!checkout || paying) return;
    setPaying(true);
    setChargeError(null);
    try {
      const d = await api("/api/payments/demo-charge", {
        method: "POST",
        body: { txId: checkout.txId, token: checkout.token, action: "charge" },
      });
      setCharged({ ok: true, amount: d.amount });
      load();
      refresh();
    } catch (err) {
      setChargeError(err.message || "The demo charge could not be completed.");
    } finally {
      setPaying(false);
    }
  };

  const closeCheckout = async (cancelled = false) => {
    if (cancelled && checkout && !charged) {
      // Abandoning the checkout cancels the PENDING placeholder so it never
      // lingers in the finance queue as an unpaid "deposit".
      api("/api/payments/demo-charge", {
        method: "POST",
        body: { txId: checkout.txId, token: checkout.token, action: "cancel" },
      }).catch(() => {});
    }
    setCheckout(null);
    setCharged(null);
    setChargeError(null);
  };

  const min = tab === "DEPOSIT" ? data.limits.minDeposit : data.limits.minWithdrawal;
  // Automatic deposits turned off (admin master switch, or nothing configured):
  // disable the submit so the user is guided to Manual instead of hitting a 503.
  const autoUnavailable =
    tab === "DEPOSIT" && mode === "AUTO" && gateway.loaded && !gateway.enabled && !gateway.demo;

  return (
    <div className="wallet">
      <div className="cards">
        <div className="glass card gold">
          <span>Real balance</span>
          <strong className="mono">{money(user?.balanceReal)}</strong>
          <em className="dim">Tradeable · withdrawable</em>
        </div>
        <div className="glass card">
          <span>Demo balance</span>
          <strong className="mono">{money(user?.balanceDemo)}</strong>
          <em className="dim">Practice funds</em>
        </div>
        <div className="glass card">
          <span>KYC status</span>
          <strong style={{ fontSize: 19 }}>{user?.kycStatus?.replace("_", " ") || "NONE"}</strong>
          <em className="dim">
            {user?.kycStatus === "VERIFIED" ? (
              "Withdrawals unlocked"
            ) : (
              <Link href="/dashboard/kyc" className="gold-text">
                Verify to withdraw →
              </Link>
            )}
          </em>
        </div>
      </div>

      {walletError && !previewMode && (
        <div className="alert alert-error wallet-load-error" role="alert">
          <span>
            <strong>Wallet unavailable.</strong> {walletError}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setWalletLoading(true);
              load();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="split" aria-busy={walletLoading}>
        <section className="glass panel">
          <div className="tabs">
            {["DEPOSIT", "WITHDRAWAL"].map((t) => (
              <button
                key={t}
                className={`tab ${tab === t ? "active" : ""}`}
                onClick={() => {
                  setTab(t);
                  setMsg(null);
                }}
              >
                {t === "DEPOSIT" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>

          {tab === "DEPOSIT" && (
            <div className="mode-switch">
              <button
                type="button"
                className={`mode ${mode === "AUTO" ? "active" : ""}`}
                onClick={() => setMode("AUTO")}
              >
                <span className="mode-ic">
                  <Zap size={18} style={{ color: "var(--gold-1)" }} />
                </span>
                <span>
                  <strong>Automatic</strong>
                  <em>Instant crypto gateway</em>
                </span>
              </button>
              <button
                type="button"
                className={`mode ${mode === "MANUAL" ? "active" : ""}`}
                onClick={() => setMode("MANUAL")}
              >
                <span className="mode-ic">
                  <ReceiptText size={18} style={{ color: "var(--gold-1)" }} />
                </span>
                <span>
                  <strong>Manual</strong>
                  <em>bKash · Nagad · Bank · Crypto</em>
                </span>
              </button>
            </div>
          )}

          {msg && (
            <div className={`alert alert-${msg.kind === "ok" ? "ok" : "error"}`}>{msg.text}</div>
          )}

          <form onSubmit={submit}>
            {tab === "DEPOSIT" && mode === "MANUAL" && rails.length > 0 && (
              <div className="field">
                <label>Payment method</label>
                <div className="rails">
                  {rails.map((r) => {
                    const brand = brandFor(r.code);
                    return (
                      <button
                        type="button"
                        key={r.code}
                        className={`rail ${activeRail?.code === r.code ? "active" : ""}`}
                        style={
                          brand
                            ? {
                                borderColor:
                                  activeRail?.code === r.code ? brand.border : "var(--stroke)",
                                background:
                                  activeRail?.code === r.code ? brand.bg : "rgba(255,255,255,0.03)",
                              }
                            : undefined
                        }
                        onClick={() => setSelectedRail(r.code)}
                      >
                        <span className="rail-ic">
                          <KindIcon kind={r.kind} brand={brand} />
                        </span>
                        <span className="rail-name">{brand?.label || r.name}</span>
                        <span className="rail-kind">{KIND_LABEL[r.kind]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "DEPOSIT" && mode === "MANUAL" && activeRail && (
              <div className="pay-box">
                {activeRail.qrData || activeRail.isCrypto || activeRail.kind === "CRYPTO" ? (
                  <div className="pay-qr">
                    <QRPlaceholder
                      data={activeRail.qrData || activeRail.address}
                      label={activeRail.name}
                    />
                  </div>
                ) : null}
                <div className="pay-detail">
                  <span className="dim">
                    {activeRail.isCrypto ? "Send to wallet address" : "Send to account / number"}
                  </span>
                  <code className="pay-address">{activeRail.address}</code>
                  {activeRail.extra && <em className="dim pay-extra">{activeRail.extra}</em>}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={copyAddress}>
                    {copied ? (
                      <>
                        <Check size={13} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy address
                      </>
                    )}
                  </button>
                  {activeRail.instructions && (
                    <p className="pay-instructions">{activeRail.instructions}</p>
                  )}
                </div>
              </div>
            )}

            <div className="field">
              <label>Amount (USD) · minimum {money(min || 0)}</label>
              <input
                className="input mono"
                type="number"
                min={min || 1}
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            {tab === "DEPOSIT" && mode === "MANUAL" && (
              <>
                <div className="field">
                  <label>
                    {activeRail?.kind === "CRYPTO"
                      ? "Transaction hash (TxID)"
                      : "Transaction ID (TrxID)"}
                  </label>
                  <input
                    className="input mono"
                    required
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder={activeRail?.kind === "CRYPTO" ? "0x… / TRX hash" : "e.g. 9N7A…"}
                  />
                </div>
                {activeRail?.kind !== "CRYPTO" && (
                  <div className="field">
                    <label>Your sender number / account</label>
                    <input
                      className="input mono"
                      value={form.senderAccount}
                      onChange={(e) => setForm({ ...form, senderAccount: e.target.value })}
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                )}
                <div className="field">
                  <label>Payment screenshot (proof)</label>
                  <ProofDropzone preview={preview} onAccepted={onAccepted} onRemove={clearProof} />
                </div>
              </>
            )}

            {tab === "DEPOSIT" && mode === "AUTO" && autoCoins.length > 0 && (
              <div className="field">
                <label>Payment method (coin)</label>
                <div className="rails">
                  {autoCoins.map((r) => {
                    const brand = brandFor(r.code);
                    return (
                      <button
                        type="button"
                        key={r.code}
                        className={`rail ${activeRail?.code === r.code ? "active" : ""}`}
                        style={
                          brand
                            ? {
                                borderColor:
                                  activeRail?.code === r.code ? brand.border : "var(--stroke)",
                                background:
                                  activeRail?.code === r.code ? brand.bg : "rgba(255,255,255,0.03)",
                              }
                            : undefined
                        }
                        onClick={() => setSelectedRail(r.code)}
                      >
                        <span className="rail-ic">
                          <KindIcon kind={r.kind} brand={brand} />
                        </span>
                        <span className="rail-name">{brand?.label || r.name}</span>
                        <span className="rail-kind">{KIND_LABEL[r.kind]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "DEPOSIT" && mode === "AUTO" && (
              <div className="alert alert-info">
                {gateway.demo ? (
                  <>
                    <strong>Demo gateway is active</strong> — no live payment key is configured in
                    this preview, so you will complete the charge at the in-app checkout. The
                    deposit is <strong>auto-approved only after the payment is taken</strong>;
                    submitting the form alone never credits your balance. In production this same
                    flow redirects to the NOWPayments hosted checkout and is auto-approved by the
                    signed webhook.
                  </>
                ) : gateway.enabled ? (
                  <>
                    Automatic deposits are credited after network confirmation. Enter the amount,
                    continue to the gateway, and send the exact USDT/BTC value. Your balance updates
                    itself — no screenshot needed.
                  </>
                ) : gateway.autoDeposits === false ? (
                  <>
                    Automatic deposits are currently <strong>disabled by the administrator</strong>{" "}
                    — the ⚡ Automatic tab is turned off across the whole site. Please use the
                    Manual deposit tab.
                  </>
                ) : gateway.reason === "DEMO_DISABLED" ? (
                  <>
                    The automatic checkout is currently <strong>switched off</strong> (no live
                    gateway key, and the demo is disabled) — only the Manual deposit tab can be used
                    right now.
                  </>
                ) : (
                  <>
                    Automatic deposits are not configured on this deployment — please use the Manual
                    deposit tab.
                  </>
                )}
              </div>
            )}

            {tab === "WITHDRAWAL" && rails.length > 0 && (
              <div className="field">
                <label>Withdrawal method</label>
                <div className="rails">
                  {rails.map((r) => {
                    const brand = brandFor(r.code);
                    return (
                      <button
                        type="button"
                        key={r.code}
                        className={`rail ${activeRail?.code === r.code ? "active" : ""}`}
                        style={
                          brand
                            ? {
                                borderColor:
                                  activeRail?.code === r.code ? brand.border : "var(--stroke)",
                                background:
                                  activeRail?.code === r.code ? brand.bg : "rgba(255,255,255,0.03)",
                              }
                            : undefined
                        }
                        onClick={() => setSelectedRail(r.code)}
                      >
                        <span className="rail-ic">
                          <KindIcon kind={r.kind} brand={brand} />
                        </span>
                        <span className="rail-name">{brand?.label || r.name}</span>
                        <span className="rail-kind">{r.extra || KIND_LABEL[r.kind]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "WITHDRAWAL" && (
              <div className="field">
                <label>Payout address or account number</label>
                <input
                  className="input mono"
                  required
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="e.g. TXn8…  /  01XXXXXXXXX"
                />
              </div>
            )}

            {tab === "WITHDRAWAL" &&
              user?.kycStatus !== "VERIFIED" &&
              data.limits.withdrawalNeedsKyc && (
                <div className="alert alert-warn">
                  Withdrawals require a verified identity.{" "}
                  <Link href="/dashboard/kyc" className="gold-text">
                    Complete KYC →
                  </Link>
                </div>
              )}

            {tab === "DEPOSIT" && mode === "MANUAL" && (
              <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
                <strong>Manual deposit — admin review required.</strong> Your balance is credited
                only after the finance desk verifies this payment (TrxID + screenshot) against the
                actual transaction. It is <strong>never automatic</strong> — do not submit a deposit
                you have not really paid.
              </div>
            )}

            <button
              className="btn btn-gold btn-block"
              disabled={
                busy || walletLoading || Boolean(walletError) || autoUnavailable || !activeRail
              }
            >
              {busy || walletLoading ? (
                <span className="spinner" />
              ) : tab === "DEPOSIT" ? (
                mode === "AUTO" ? (
                  autoUnavailable ? (
                    "Automatic deposits off"
                  ) : (
                    "Continue to gateway →"
                  )
                ) : (
                  "Submit for manual review"
                )
              ) : (
                "Request withdrawal"
              )}
            </button>
            <p className="dim" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
              {tab === "DEPOSIT" && mode === "MANUAL"
                ? "Review steps: admin verifies your TrxID/screenshot against the payment network, then credits atomically. One payment reference can only be deposited once."
                : tab === "DEPOSIT" && mode === "AUTO" && !autoUnavailable
                  ? "You are taken to the secure checkout; the balance is credited automatically as soon as the payment is confirmed — no screenshot, no manual review."
                  : "Requests enter the finance queue and are released by an administrator. You will be notified on approval."}
            </p>
          </form>
        </section>

        <section className="glass panel">
          <h3>Transaction history</h3>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="dim">{fmtDate(t.createdAt)}</td>
                    <td>{t.type}</td>
                    <td>{t.method}</td>
                    <td className="mono">{money(t.amount)}</td>
                    <td>
                      <span className={`badge ${t.mode === "AUTO" ? "badge-info" : ""}`}>
                        {t.mode || "MANUAL"}
                      </span>
                    </td>
                    <td>
                      <span className={STATUS_CLASS[t.status] || "badge"}>{t.status}</span>
                    </td>
                    <td className="dim">
                      {t.adminNote ||
                        (t.hasProof ? (
                          <>
                            <Paperclip size={11} style={{ verticalAlign: "-2px" }} /> proof
                          </>
                        ) : (
                          "—"
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.transactions.length && <div className="empty">No transactions yet.</div>}
          </div>
        </section>
      </div>

      {/* ── NexaPay demo checkout: payment is taken BEFORE the request is approved ── */}
      <AnimatePresence>
        {checkout && (
          <>
            <motion.div
              key="co-scrim"
              className="co-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeCheckout(true)}
            />
            <motion.div
              key="co-panel"
              className="co-panel"
              initial={{ opacity: 0, y: 22, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <div
                className="co-card"
                role="dialog"
                aria-modal="true"
                aria-label="Deposit checkout"
              >
                <div className="co-head">
                  <div>
                    <span className="co-eyebrow">PAYMENT GATEWAY</span>
                    <h3 className="co-title">Deposit checkout</h3>
                  </div>
                  <div className="co-close-wrap">
                    <span className="co-badge">DEMO</span>
                    <button
                      type="button"
                      className="co-close"
                      onClick={() => closeCheckout(true)}
                      aria-label="Close checkout"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {charged?.ok ? (
                  <div className="co-done">
                    <span className="co-done-ic">
                      <Check size={26} />
                    </span>
                    <h3>Deposit approved automatically</h3>
                    <p>
                      <strong>{money(charged.amount)}</strong> has been credited to your real
                      balance. The payment was taken first — the request was approved only after the
                      charge completed.
                    </p>
                    <button
                      type="button"
                      className="btn btn-gold"
                      onClick={() => closeCheckout(false)}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="co-lead">
                      Complete the payment below. Your balance is credited{" "}
                      <strong>automatically — and only</strong> after the payment is confirmed by
                      the gateway.
                    </p>
                    <div className="co-rows">
                      <div className="co-row">
                        <span>Amount</span>
                        <strong className="mono">{money(checkout.amount)}</strong>
                      </div>
                      <div className="co-row">
                        <span>Pay with</span>
                        <strong>{payLabel(checkout.method)}</strong>
                      </div>
                      <div className="co-row">
                        <span>Network</span>
                        <strong>
                          {checkout.method === "BITCOIN"
                            ? "Bitcoin"
                            : checkout.method === "ETHEREUM" || checkout.method === "USDT_ERC20"
                              ? "Ethereum"
                              : "Tron (TRC-20)"}
                        </strong>
                      </div>
                    </div>

                    {chargeError && <div className="alert alert-error">{chargeError}</div>}

                    <button
                      type="button"
                      className="btn btn-gold btn-block co-pay"
                      disabled={paying}
                      onClick={payDemoCharge}
                    >
                      {paying ? (
                        <>
                          <span className="spinner" /> Processing payment…
                        </>
                      ) : (
                        <>Pay {money(checkout.amount)} now</>
                      )}
                    </button>
                    <p className="co-note">
                      <ShieldCheck size={13} /> Demo gateway — the charge is simulated in this
                      preview. In production this is the NOWPayments hosted checkout and the deposit
                      is auto-approved by its signed webhook.
                    </p>
                    <button
                      type="button"
                      className="co-cancel"
                      disabled={paying}
                      onClick={() => closeCheckout(true)}
                    >
                      Cancel — I will not pay
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .wallet-load-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
  .card { min-width: 0; padding: 20px; display: grid; gap: 8px; border: 1px solid rgba(255,255,255,.1); background: linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.025)); box-shadow: 0 18px 50px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter: blur(18px); }
  .card strong, .card em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .card span { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--dim); }
        .card strong { font-size: 27px; }
        .card em { font-style: normal; font-size: 12px; }
        .card.gold { background: radial-gradient(120% 120% at 0% 0%, rgba(242, 184, 75, 0.16), rgba(20, 25, 38, 0.72)); }
        .card.gold strong { color: var(--gold-1); }
        .split { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
        .panel { padding: 20px; min-width: 0; }
        .panel h3 { margin: 0; font-size: 16px; }
        .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px; background: rgba(0, 0, 0, 0.35); border-radius: 12px; margin-bottom: 16px; }
        .tab { padding: 10px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-weight: 700; font-size: 13px; min-width: 0; }
        .tab.active { background: var(--gold-grad); color: #17130a; }

        .mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
        .mode { display: flex; align-items: center; gap: 10px; text-align: left; padding: 12px; border-radius: 12px; border: 1px solid var(--stroke); background: rgba(255,255,255,0.03); color: var(--text); transition: all 0.16s; min-width: 0; }
        .mode.active { border-color: rgba(242,184,75,0.5); background: rgba(242,184,75,0.1); }
        .mode-ic { font-size: 20px; display: grid; place-items: center; }
        .mode strong { display: block; font-size: 13px; }
        .mode em { font-style: normal; font-size: 11px; color: var(--dim); }

        .rails { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .rail { display: grid; gap: 2px; padding: 11px; border-radius: 11px; border: 1px solid var(--stroke); background: rgba(255,255,255,0.03); color: var(--text); text-align: left; transition: all 0.15s; }
        .rail-ic { display: grid; place-items: start; }
        .rail-name { font-size: 12.5px; font-weight: 700; }
        .rail-kind { font-size: 10.5px; color: var(--dim); }

        .pay-box { display: flex; gap: 14px; padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--stroke); margin-bottom: 16px; }
        .pay-qr { flex-shrink: 0; }
        .qr { width: 104px; height: 104px; display: grid; grid-template-columns: repeat(11, 1fr); gap: 1px; padding: 6px; background: #fff; border-radius: 10px; }
        .qr i { background: transparent; border-radius: 1px; }
        .qr i.on { background: #10141d; }
        .pay-detail { display: grid; gap: 6px; align-content: start; min-width: 0; }
        .pay-detail > span { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; }
        .pay-address { font-family: var(--mono); font-size: 12px; word-break: break-all; background: rgba(255,255,255,0.05); padding: 7px 9px; border-radius: 8px; color: var(--gold-1); }
        .pay-extra { font-style: normal; font-size: 11px; }
        .pay-instructions { font-size: 11.5px; color: var(--muted); line-height: 1.6; margin: 4px 0 0; }

        .proof { display: grid; gap: 10px; }
        .dropzone {
          display: grid; place-items: center; gap: 4px; text-align: center;
          padding: 26px 16px; border-radius: 12px; cursor: pointer;
          border: 1.5px dashed rgba(255,255,255,0.16); background: rgba(255,255,255,0.02);
          transition: all 0.18s ease;
        }
        .dropzone:hover { border-color: rgba(242,184,75,0.5); background: rgba(242,184,75,0.05); }
        .dropzone.drag { border-color: rgba(242,184,75,0.7); background: rgba(242,184,75,0.12); }
        .dropzone p { margin: 4px 0 0; font-size: 13px; font-weight: 600; color: var(--text); }
        .dropzone span { font-size: 11px; color: var(--dim); }
        .proof-preview { display: flex; align-items: center; gap: 12px; }
        .proof-preview img { width: 96px; height: 96px; object-fit: cover; border-radius: 10px; border: 1px solid var(--stroke); }
        .proof-meta { display: grid; gap: 6px; }
        .proof-meta .ok { color: #10b981; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; }

        /* ── deposit checkout overlay ── */
        .co-scrim { position: fixed; inset: 0; z-index: 150; background: rgba(5, 8, 14, 0.68); backdrop-filter: blur(7px); }
        .co-panel {
          position: fixed; inset: 0; z-index: 151; display: flex; align-items: center; justify-content: center;
          pointer-events: none; padding: 16px;
        }
        .co-card {
          pointer-events: auto; width: min(92vw, 460px); max-height: calc(100vh - 40px); overflow-y: auto;
          padding: 22px; border-radius: 18px; background: rgba(13, 18, 28, 0.96);
          border: 1px solid rgba(242, 184, 75, 0.35); box-shadow: 0 30px 90px rgba(0,0,0,0.6), 0 0 60px rgba(242, 184, 75, 0.12);
          color: var(--text);
        }
        .co-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .co-eyebrow { font-size: 10px; letter-spacing: 1.8px; color: var(--dim); font-weight: 700; }
        .co-title { margin: 2px 0 0; font-size: 19px; }
        .co-close-wrap { display: flex; align-items: center; gap: 8px; }
        .co-badge {
          font-size: 10px; font-weight: 800; letter-spacing: 0.6px; padding: 3px 8px; border-radius: 999px;
          color: #f2b84b; background: rgba(242, 184, 75, 0.12); border: 1px solid rgba(242, 184, 75, 0.4);
        }
        .co-close {
          display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; border: 0;
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); cursor: pointer;
        }
        .co-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .co-lead { margin: 0 0 14px; font-size: 13px; color: var(--muted); line-height: 1.6; }
        .co-lead strong { color: var(--gold-1); }
        .co-rows { display: grid; gap: 8px; margin-bottom: 16px; }
        .co-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 11px 13px; border-radius: 11px; background: rgba(255,255,255,0.04);
          border: 1px solid var(--stroke); font-size: 13px;
        }
        .co-row span { color: var(--dim); font-size: 12px; }
        .co-pay { min-height: 44px; }
        .co-pay .spinner { width: 16px; height: 16px; border-width: 2px; }
        .co-note { display: flex; align-items: flex-start; gap: 7px; margin: 12px 0 0; font-size: 11.5px; color: var(--dim); line-height: 1.55; }
        .co-note svg { flex-shrink: 0; margin-top: 2px; color: #f2b84b; }
        .co-cancel {
          margin: 14px auto 0; display: block; border: 0; background: none; color: rgba(255,255,255,0.45);
          font-size: 12.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
        }
        .co-cancel:hover { color: #fff; }
        .co-done { display: grid; place-items: center; text-align: center; gap: 4px; padding: 16px 6px; }
        .co-done-ic {
          display: grid; place-items: center; width: 62px; height: 62px; margin-bottom: 8px; border-radius: 50%;
          color: #10b981; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.45);
          box-shadow: 0 0 36px rgba(16, 185, 129, 0.25);
        }
        .co-done h3 { margin: 0 0 6px; font-size: 17px; color: #10b981; }
        .co-done p { margin: 0 0 16px; font-size: 13px; color: var(--muted); line-height: 1.6; max-width: 340px; }
        .co-done p strong { color: var(--gold-1); }

        @media (max-width: 980px) { .split { grid-template-columns: 1fr; } }
        @media (max-width: 640px) {
          .cards { grid-template-columns: 1fr; }
          .card strong { font-size: 22px; }
        }
        @media (max-width: 480px) {
          .rails { grid-template-columns: 1fr; }
          .mode-switch { grid-template-columns: 1fr; }
          .pay-box { flex-direction: column; align-items: center; text-align: center; }
        }
      `}</style>
    </div>
  );
}
