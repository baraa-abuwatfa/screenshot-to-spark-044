// Shared rule for when a plan may be generated. Used by the server (authoritative)
// and the UI (to hide/disable the button).
export const STALE_PROCESSING_MS = 5 * 60 * 1000;

export function canStartGeneration(
  status: string,
  hasPlan: boolean,
  updatedAt: string | Date,
  now: number = Date.now(),
): boolean {
  if (hasPlan || status === "completed") return false;
  if (status === "pending" || status === "failed") return true;
  if (status === "processing") return now - new Date(updatedAt).getTime() > STALE_PROCESSING_MS;
  return false;
}

// Only a failed request without a plan can be edited before retrying.
export function canEditRequest(status: string, hasPlan: boolean): boolean {
  return status === "failed" && !hasPlan;
}
