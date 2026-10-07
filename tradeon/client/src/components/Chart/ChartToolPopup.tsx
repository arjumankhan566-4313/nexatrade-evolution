/**
 * ChartToolPopup — the pop-up window behind the chart tool buttons.
 *
 * Deliberately the SAME system as the market catalogue (`MarketSelector`): a
 * dark #131722 card, a titled header with a close button, click-outside and
 * Escape to dismiss, and one titled SECTION per group of options. A chart tool
 * therefore opens exactly the way the Markets button does, with everything its
 * sections are supposed to hold.
 *
 * `anchor` only decides which side the card grows from — `rail` opens to the
 * right of the terminal's left rail (beside the button, like the timeframe
 * menu), `floating` opens above the phone's floating tools bar.
 */
import { useEffect, type ReactNode } from 'react';
import '../../styles/chart-tools-popup.css';

export interface ToolOption {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface ToolSection {
  title: string;
  options: ToolOption[];
}

interface Props {
  title: string;
  /** Short line under the title, e.g. the asset style currently painted. */
  hint?: string;
  sections: ToolSection[];
  /** Option drawn as selected (radio semantics). */
  activeId?: string | null;
  anchor: 'rail' | 'floating';
  onPick: (id: string) => void;
  onClose: () => void;
}

export default function ChartToolPopup({
  title,
  hint,
  sections,
  activeId,
  anchor,
  onPick,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Click-catcher: the chart stays visible behind the card. */}
      <button
        type="button"
        className="toolpop__backdrop"
        aria-label={`Close ${title}`}
        onClick={onClose}
      />

      <div className={`toolpop toolpop--${anchor}`} role="dialog" aria-label={title}>
        <header className="toolpop__head">
          <span className="toolpop__titles">
            <h2 className="toolpop__title">{title}</h2>
            {hint && <small className="toolpop__hint">{hint}</small>}
          </span>
          <button type="button" className="toolpop__close" onClick={onClose} aria-label={`Close ${title}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="toolpop__body">
          {sections.map((section) => (
            <section key={section.title} className="toolpop__section">
              <h3 className="toolpop__section-title">{section.title}</h3>
              <div className="toolpop__grid">
                {section.options.map((option) => {
                  const active = option.id === activeId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`toolpop__opt ${active ? 'is-active' : ''}`}
                      onClick={() => onPick(option.id)}
                    >
                      <span className="toolpop__opt-icon" aria-hidden="true">{option.icon}</span>
                      <span className="toolpop__opt-label">{option.label}</span>
                      {active && (
                        <svg className="toolpop__opt-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
