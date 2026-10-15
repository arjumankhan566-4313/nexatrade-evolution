/**
 * AssetLogo — an OTC instrument's official artwork (company mark, coin mark or
 * currency flags), with a professional monogram badge instead of a broken
 * image when the artwork is missing or fails to load.
 */
import { useState } from "react";

interface Props {
  icon?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export default function AssetLogo({ icon, name, size = 24, className }: Props) {
  const [failed, setFailed] = useState(false);
  const monogram = name
    .replace(/\s*\(OTC\)/i, "")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  if (!icon || failed) {
    return (
      <span
        className={`asset-logo asset-logo--mono ${className ?? ""}`}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
        aria-hidden="true"
      >
        {monogram}
      </span>
    );
  }

  return (
    <img
      className={`asset-logo ${className ?? ""}`}
      src={icon}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
