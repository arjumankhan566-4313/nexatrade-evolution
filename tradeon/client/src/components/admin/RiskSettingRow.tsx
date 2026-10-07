/** Legacy setting-row/switch markup, with keyboard-accessible React controls. */
import type { ReactNode } from 'react';

export function RiskSettingRow({ title, description, children }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return <div className="setting-row">
    <div><div className="st">{title}</div>{description && <div className="sd">{description}</div>}</div>
    <div className="sc">{children}</div>
  </div>;
}

export function RiskSwitch({ id, label, checked, disabled, onChange }: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return <button id={id} type="button" role="switch" aria-label={label}
    aria-checked={checked} disabled={disabled} onClick={onChange}
    className={`switch ${checked ? 'on' : ''}`} />;
}
