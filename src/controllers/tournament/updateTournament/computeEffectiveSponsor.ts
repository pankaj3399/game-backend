import type { Types } from "mongoose";

/**
 * Resolves sponsor after update rules: when the club changes and the client
 * omits `sponsor`, the sponsor is cleared (null). Otherwise the incoming value
 * wins when present; omitted fields keep the current sponsor.
 */
export function computeEffectiveSponsor(
  clubChanged: boolean,
  incomingSponsor: string | null | undefined,
  currentSponsor: string | Types.ObjectId | null | undefined
) {
  if (clubChanged && incomingSponsor === undefined) {
    return null;
  }
  if (incomingSponsor !== undefined) {
    return incomingSponsor;
  }
  if (currentSponsor == null) {
    return null;
  }
  return typeof currentSponsor === "string"
    ? currentSponsor
    : currentSponsor.toString();
}
