import { useState } from "react";

/** Original market artwork, with a visible fallback instead of an empty cell. */
export default function OtcInstrumentIcon({
  icon,
  base,
  symbol,
  category,
  loading = "lazy",
}: {
  icon?: string | null;
  base?: string;
  symbol: string;
  category?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!icon || failedUrl === icon) {
    return <span className="otc-row-icon-fallback">{String(base || symbol).slice(0, 2)}</span>;
  }
  return (
    <img
      src={icon}
      alt=""
      className="otc-row-icon"
      width={22}
      height={22}
      loading={loading}
      decoding="async"
      data-category={category}
      onError={() => setFailedUrl(icon)}
    />
  );
}
