
import { Check } from 'lucide-react';

/**
 * Connected-track KYC stepper (Spec §6.7 / §10.3):
 *   done     → gold fill + check
 *   current  → gold ring pulse
 *   upcoming → dim outline + step number
 */
export default function Stepper({ steps, currentStep }) {
  return (
    <div className="stepper" role="list" aria-label="KYC progress">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <div key={label} className="stepper-step" role="listitem">
            <div className={`stepper-dot ${isDone ? 'done' : isCurrent ? 'current' : 'upcoming'}`}>
              {isDone ? <Check size={15} /> : stepNum}
            </div>
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                whiteSpace: 'nowrap',
                color: isDone ? 'var(--gold-1)' : isCurrent ? 'var(--text)' : 'var(--dim)',
                fontWeight: isCurrent ? 600 : 500,
              }}
            >
              {label}
            </span>
            {stepNum < steps.length && <div className={`stepper-line ${isDone ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}
