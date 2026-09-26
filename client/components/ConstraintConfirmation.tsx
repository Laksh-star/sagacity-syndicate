import type { ConstraintConfirmation as ConstraintConfirmationType } from "../../shared/schemas.js";

export function ConstraintConfirmation({
  confirmation,
  onConfirm,
  onReject,
}: {
  confirmation: ConstraintConfirmationType;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return <section className="constraint-confirmation" role="status" aria-live="polite">
    <div>
      <span className="eyebrow">Material change awaiting confirmation</span>
      <h2>Confirm before the council reconvenes</h2>
      <p>{confirmation.confirmationQuestion}</p>
      {(confirmation.newValue || confirmation.previousValue) && <dl>
        {confirmation.previousValue && <div><dt>Previous value</dt><dd>{confirmation.previousValue}</dd></div>}
        {confirmation.newValue && <div><dt>New value</dt><dd>{confirmation.newValue}</dd></div>}
      </dl>}
      <small>Interpretation confidence: {Math.round(confirmation.interpretationConfidence * 100)}%. The visible Decision Scroll remains authoritative until you confirm.</small>
    </div>
    <div className="constraint-confirmation__actions">
      <button className="primary" onClick={onConfirm}>Confirm and reconvene</button>
      <button className="quiet-button" onClick={onReject}>That is not right</button>
    </div>
  </section>;
}
