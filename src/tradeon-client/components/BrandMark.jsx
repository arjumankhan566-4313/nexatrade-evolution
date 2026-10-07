/**
 * BrandMark — the TRADEON lockup for the admin / terminal shell.
 *
 * Renders the official monogram + wordmark artwork (public/brand/). The brand
 * subtitle ("SMART TRADING. ALWAYS ON.") belongs to the landing hero only and is
 * never rendered here; `subtitle` is a separate contextual label (e.g. the
 * admin control-center name).
 *
 * `withText={false}` shows the monogram alone (collapsed sidebar / favicon).
 */
export default function BrandMark({ size = 40, withText = true, subtitle = '' }) {
  if (!withText) {
    return (
      <img
        src="/brand/tradeon-mark.png"
        width={size}
        height={size}
        alt="TRADEON"
        style={{ display: 'block', flex: 'none', objectFit: 'contain' }}
      />
    );
  }
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#f1f7ff', minWidth: 0 }}
    >
      <img
        src="/brand/tradeon-mark.png"
        height={size}
        alt=""
        aria-hidden="true"
        style={{ display: 'block', flex: 'none', objectFit: 'contain' }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <img
          src="/brand/tradeon-wordmark.png"
          height={Math.round(size * 0.44)}
          alt="TRADEON"
          style={{ display: 'block', flex: 'none', imageRendering: 'auto' }}
        />
        {subtitle ? (
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#8b98ad',
              marginTop: 2,
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
