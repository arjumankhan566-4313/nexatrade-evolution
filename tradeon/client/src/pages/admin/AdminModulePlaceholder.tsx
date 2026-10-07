/**
 * AdminModulePlaceholder — temporary stand-in for admin modules that have
 * not yet been 1:1-ported from the legacy nexa-admin-portal. It keeps the
 * animated admin shell navigable without 404s while each page is ported.
 */
import { Wrench } from 'lucide-react';

const TITLES: Record<string, string> = {
  users: 'Users',
  kyc: 'KYC Verification',
  finance: 'Deposits / Withdrawals',
  affiliate: 'Affiliate Network',
  risk: 'Risk Engine',
  assets: 'Markets',
  otc: 'OTC Markets',
  gamification: 'Tournaments & VIP',
  fraud: 'Fraud Monitor',
  logs: 'System Logs',
};

export default function AdminModulePlaceholder({ module }: { module: string }) {
  return (
    <div style={{ padding: '48px 28px', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div className="nt-card" style={{ maxWidth: 460, padding: '40px 30px' }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, margin: '0 auto 18px', borderRadius: 14, background: 'rgba(0,242,254,0.08)', border: '1px solid rgba(0,242,254,0.25)', color: '#00f2fe' }}>
          <Wrench size={26} />
        </span>
        <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700 }}>{TITLES[module] || module}</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#7c8ba2' }}>
          This control module is being 1:1-ported from the legacy administration
          portal. Its UI, data and animations will appear here once the port
          lands — nothing is redesigned.
        </p>
      </div>
    </div>
  );
}
