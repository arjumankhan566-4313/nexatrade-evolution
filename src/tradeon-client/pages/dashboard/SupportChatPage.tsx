// @ts-nocheck

import Link from '@/tradeon-client/components/dashboard/WorkspaceLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Bot, CircleHelp, MessageCircle, Search, ShieldCheck, Wallet, CandlestickChart, BadgeCheck } from 'lucide-react';
import { useSession } from '@/tradeon-client/components/dashboard/SessionProvider';
import { money } from '@/tradeon-client/lib/apiClient';
import '@/styles/training-chat.css';

const TOPICS = [
  { id: 'trading', label: 'Trading help', icon: CandlestickChart, preview: 'Markets, orders and demo trading', intro: 'Welcome to support. I can help with trading, wallet, KYC, and account questions.', starters: ['How do I place a trade?'], href: '/dashboard', action: 'Open terminal' },
  { id: 'wallet', label: 'Wallet & payments', icon: Wallet, preview: 'Deposits, withdrawals and balances', intro: 'Need help with a deposit, withdrawal or pending balance? Check your wallet for the latest transaction status.', starters: ['Why is my balance pending?'], href: '/dashboard/wallet', action: 'Open wallet' },
  { id: 'kyc', label: 'Identity verification', icon: BadgeCheck, preview: 'Documents and verification status', intro: 'I can explain how to complete identity verification. Your account’s latest KYC status is shown below.', starters: ['How can I complete KYC?'], href: '/dashboard/kyc', action: 'Open KYC profile' },
  { id: 'security', label: 'Account security', icon: ShieldCheck, preview: 'Password, devices and account access', intro: 'Manage passwords, two-factor authentication and connected devices from your Security page. Never share recovery codes or credentials here.', starters: ['How do I secure my account?'], href: '/dashboard/security', action: 'Open security' },
];
const ANSWERS = {
  'How do I place a trade?': 'Open Terminal, choose a market, select an expiry, enter your investment, then choose CALL or PUT. Demo mode is available for practice.',
  'Why is my balance pending?': 'Deposits and withdrawals remain pending until the payment rail confirms them. You can follow the status from Wallet and History.',
  'How can I complete KYC?': 'Open KYC Profile from the sidebar, upload the requested documents, and submit them for review. Your status will update in your account.',
  'How do I secure my account?': 'Open Security to change your password, manage two-factor authentication, inspect account activity and sign out other devices.',
};

const CHAT_KEY = 'nexa.support.chat';

function emptyConversations() {
  return Object.fromEntries(TOPICS.map(topic => [topic.id, [{ id: `${topic.id}-welcome`, role: 'assistant', text: topic.intro }]]));
}

/**
 * The conversation is kept for the browser session, so remounting this page
 * (navigation, a session re-read) no longer wipes what the user just wrote.
 */
function readConversations() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return emptyConversations();
    return { ...emptyConversations(), ...saved };
  } catch {
    return emptyConversations();
  }
}

export default function SupportChatPage() {
  const { user } = useSession();
  const [selected, setSelected] = useState('trading');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState(readConversations);
  const [drafts, setDrafts] = useState({});
  const sequence = useRef(0);
  const scroller = useRef(null);
  const topic = TOPICS.find(item => item.id === selected);
  const messages = conversations[selected];
  const filtered = useMemo(() => TOPICS.filter(item => `${item.label} ${item.preview}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const suggestions = topic.starters.filter(item => !messages.some(message => message.text === item));
  const canSend = draft.trim().length > 0;
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages, selected]);
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(conversations)); } catch { /* private mode — keep it in memory */ } }, [conversations]);

  function selectThread(id) {
    setDrafts(current => ({ ...current, [selected]: draft }));
    setSelected(id);
    setDraft(drafts[id] || '');
  }
  function sendMessage(text = draft) {
    const value = text.trim();
    if (!value) return;
    const reply = ANSWERS[value] || 'I can help with Terminal, Wallet, KYC, balances, and account security. For account-specific issues, please include the screen or transaction status you are seeing. These are automated help replies; use Contact support below for further assistance.';
    const id = ++sequence.current;
    setConversations(current => ({ ...current, [selected]: [...current[selected], { id: `${selected}-${id}-user`, role: 'user', text: value }, { id: `${selected}-${id}-reply`, role: 'assistant', text: reply }] }));
    setDraft('');
    setDrafts(current => ({ ...current, [selected]: '' }));
  }

  return <div className="training-chat-page">
    <header className="training-workspace-heading"><div><p className="training-eyebrow">ACCOUNT HELP</p><h1>Support workspace</h1><p>Find a quick answer and get back to your markets.</p></div><Link href="/contact" className="btn btn-sm btn-ghost">Contact support <ArrowUpRight size={15} /></Link></header>
    <div className="training-chat-layout">
      <aside className="training-chat-sidebar" aria-label="Help conversations">
        <div className="training-chat-sidebar-head"><strong>Conversations</strong><span>{TOPICS.length}</span></div>
        <label className="training-chat-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search conversations" placeholder="Search help topics…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <nav className="training-chat-threads" aria-label="Conversation topics">{filtered.map(item => {
          const Icon = item.icon;
          const last = conversations[item.id].at(-1);
          return <button key={item.id} type="button" onClick={() => selectThread(item.id)} className={`training-thread ${selected === item.id ? 'active' : ''}`} aria-pressed={selected === item.id}><span className="training-thread-icon"><Icon size={18} /></span><span className="training-thread-copy"><strong>{item.label}</strong><small>{last.id.endsWith('welcome') ? item.preview : last.text}</small></span><span className="training-thread-dot" aria-hidden="true" /></button>;
        })}{!filtered.length && <p className="training-chat-empty" role="status">No matching topics. Try “wallet” or “trading”.</p>}</nav>
        <div className="training-chat-context"><ShieldCheck size={20} /><strong>Your account</strong><span>{user?.fullName || user?.name || 'Trading account'}</span><dl><div><dt>Real balance</dt><dd>{money(user?.balanceReal)}</dd></div><div><dt>KYC status</dt><dd>{(user?.kycStatus || 'NONE').replaceAll('_', ' ')}</dd></div></dl><Link href="/dashboard/security">Account security <ArrowUpRight size={13} /></Link></div>
      </aside>
      <section className="training-chat-card" aria-labelledby="training-chat-title">
        <header className="training-chat-header"><div className="training-chat-avatar"><Bot size={22} /></div><div><h2 id="training-chat-title">{topic.label}</h2><p><span /> Automated account help</p></div><Link href={topic.href} className="training-chat-action">{topic.action} <ArrowUpRight size={14} /></Link></header>
        <div ref={scroller} className="training-chat-body"><div className="training-chat-intro"><CircleHelp size={15} /> Quick answers for your trading account</div><div className="training-message-list" role="log" aria-live="polite" aria-relevant="additions" aria-label={`${topic.label} messages`}>{messages.map(message => <div className={`training-message-row ${message.role}`} key={message.id}><span className="training-message-avatar" aria-hidden="true">{message.role === 'assistant' ? <Bot size={15} /> : (user?.fullName || user?.name || 'You').charAt(0).toUpperCase()}</span><div className="training-message"><span>{message.role === 'assistant' ? 'Support' : 'You'}</span><p>{message.text}</p></div></div>)}</div>{suggestions.length > 0 && <div className="training-chat-suggestions"><p>Popular questions</p>{suggestions.map(item => <button type="button" key={item} onClick={() => sendMessage(item)}><CircleHelp size={15} />{item}<ArrowUpRight size={13} /></button>)}</div>}</div>
        <form className="training-chat-composer" onSubmit={event => { event.preventDefault(); sendMessage(); }}><MessageCircle size={18} aria-hidden="true" /><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} placeholder="Ask about your account or a trade…" aria-label="Message support" /><button type="submit" aria-label="Send message" disabled={!canSend}><ArrowUp size={19} /></button></form>
        <p className="training-chat-note">Automated FAQ replies · Conversations last while this page stays open. Do not share passwords or payment credentials.</p>
      </section>
    </div>
  </div>;
}
