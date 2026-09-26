import { ConstraintConfirmationSchema, type ConstraintConfirmation } from "../shared/schemas.js";

const storageKey = "sagacity-syndicate:pending-constraint:v1";

export function loadPendingConstraint(storage: Pick<Storage, "getItem"> = localStorage): ConstraintConfirmation | undefined {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = ConstraintConfirmationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function persistPendingConstraint(
  confirmation: ConstraintConfirmation,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(storageKey, JSON.stringify(ConstraintConfirmationSchema.parse(confirmation)));
}

export function clearPendingConstraint(storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(storageKey);
}
