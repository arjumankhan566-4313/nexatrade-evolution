
import { motion } from 'framer-motion';
import { LivePill } from './ui';
import { useLiveEvents } from '@/lib/realtimeClient';

/**
 * Consistent hero header for every admin sub-module (Users, KYC, Finance, …).
 * Matches the dashboard's "Executive Dashboard" header so the whole control
 * center reads as one cohesive product.
 */
export default function PageHeader({ eyebrow, title, highlight, subtitle, right }) {
  const { status } = useLiveEvents({ scope: 'admin' });
  return (
    <motion.div
      className="nt-page-head"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div>
        <div className="nt-eyebrow">{eyebrow}</div>
        <h1>
          {title} {highlight && <span className="nt-grad">{highlight}</span>}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right || <LivePill label={status === 'live' ? 'LIVE' : 'CONNECTING'} variant={status === 'live' ? 'green' : 'cyan'} />}
    </motion.div>
  );
}
