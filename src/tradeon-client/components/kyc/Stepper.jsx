import { Check } from "lucide-react";

/**
 * Connected-track KYC stepper (Spec §6.7 / §10.3):
 *   done     → green fill + check
 *   current  → gold pill, active
 *   upcoming → dim pill + step number
 * Steps are joined by connector lines; the line before a step turns green
 * once that step is reached.
 */
export default function Stepper({ steps, currentStep }) {
  return (
    <div className="stepper" role="list" aria-label="KYC progress">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <div key={label} className="stepper-item" role="listitem">
            {stepNum > 1 && (
              <div
                className={`stepper-connector ${stepNum <= currentStep ? "done" : ""}`}
                aria-hidden="true"
              />
            )}
            <div className={`stp ${isDone ? "done" : ""} ${isCurrent ? "active" : ""}`}>
              <span className="stp-no">
                {isDone ? <Check size={12} strokeWidth={3} /> : stepNum}
              </span>
              <span className="stp-label">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
