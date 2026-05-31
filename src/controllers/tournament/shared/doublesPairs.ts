export type DoublesPairsById = Record<string, string>;

function readRawMap(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }

  return {};
}

/**
 * Keeps only valid, reciprocal participant pairs.
 * Output is always symmetric: if A is paired with B, B is paired with A.
 */
export function sanitizeDoublesPairs(
  value: unknown,
  participantIds: string[]
): DoublesPairsById {
  const raw = readRawMap(value);
  const validIds = new Set(participantIds);
  const next: DoublesPairsById = {};
  const visited = new Set<string>();

  for (const participantId of participantIds) {
    if (visited.has(participantId)) continue;

    const partnerRaw = raw[participantId];
    if (typeof partnerRaw !== "string") continue;

    const partnerId = partnerRaw.trim();
    if (!partnerId || partnerId === participantId || !validIds.has(partnerId)) continue;

    const reciprocal = raw[partnerId];
    if (typeof reciprocal !== "string" || reciprocal.trim() !== participantId) continue;

    // Valid reciprocal pair — write both directions
    next[participantId] = partnerId;
    next[partnerId] = participantId;
    visited.add(participantId);
    visited.add(partnerId);
  }

  return next;
}


export function toDoublesPairsObject(value: unknown): DoublesPairsById {
  const raw = readRawMap(value);
  const next: DoublesPairsById = {};

  for (const [key, partnerRaw] of Object.entries(raw)) {
    if (typeof partnerRaw === "string") {
      next[key] = partnerRaw;
    }
  }

  return next;
}
