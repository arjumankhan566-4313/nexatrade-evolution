import { motion, useReducedMotion } from 'framer-motion';
import { BRAND } from '../config/content.config';

/**
 * The TRADEON lockup: monogram mark + wordmark, both cut from the official
 * brand artwork.
 *
 * The subtitle ("SMART TRADING. ALWAYS ON.") is part of the HERO lockup only.
 * Every other surface — header, footer, sidebars — renders the logo alone, so
 * `showTagline` must stay false everywhere except the landing hero.
 */

type LogoVariant = 'nav' | 'hero' | 'footer';

const MARK_SIZE: Record<LogoVariant, string> = {
  nav: 'h-8 sm:h-9',
  hero: 'h-14 sm:h-20',
  footer: 'h-9',
};

const WORD_SIZE: Record<LogoVariant, string> = {
  nav: 'h-4 sm:h-[18px]',
  hero: 'h-7 sm:h-10',
  footer: 'h-[18px]',
};

const TAGLINE_SIZE: Record<LogoVariant, string> = {
  nav: 'text-[9px]',
  hero: 'text-[10px] sm:text-[13px]',
  footer: 'text-[9px]',
};

type TradeonLogoProps = {
  variant?: LogoVariant;
  /** Hero lockup only. Never enable this on a nav / footer / sidebar. */
  showTagline?: boolean;
  className?: string;
};

export default function TradeonLogo({
  variant = 'nav',
  showTagline = false,
  className = '',
}: TradeonLogoProps) {
  const reduceMotion = useReducedMotion();
  const hero = variant === 'hero';

  const spring = { type: 'spring' as const, stiffness: 150, damping: 20 };

  return (
    <span className={`inline-flex items-center gap-2.5 sm:gap-3.5 ${className}`}>
      {/* Monogram. Ambient glow pulse in the hero only — decorative. */}
      <motion.img
        src={BRAND.mark}
        alt={BRAND.name}
        className={`${MARK_SIZE[variant]} w-auto shrink-0 select-none`}
        draggable={false}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: hero ? 0.05 : 0 }}
        style={
          reduceMotion || !hero
            ? undefined
            : { filter: 'drop-shadow(0 0 18px rgba(0,229,255,0.28))' }
        }
      />

      <span className="flex min-w-0 flex-col">
        <motion.img
          src={BRAND.wordmark}
          alt={BRAND.name}
          className={`${WORD_SIZE[variant]} w-auto select-none`}
          draggable={false}
          initial={reduceMotion ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring, delay: hero ? 0.14 : 0.04 }}
        />

        {/* Brand subtitle — hero lockup only. */}
        {showTagline ? (
          <motion.span
            className={`mt-1.5 font-apex font-medium uppercase text-apex-muted ${TAGLINE_SIZE[variant]}`}
            initial={reduceMotion ? false : { opacity: 0, letterSpacing: '0.55em' }}
            animate={{ opacity: 1, letterSpacing: '0.26em' }}
            transition={{ duration: 0.9, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {BRAND.tagline}
          </motion.span>
        ) : null}
      </span>
    </span>
  );
}
