/**
 * Normalized capacity from `maxMember` for join rules and detail `permissions.canJoin`.
 * Missing, non-finite, or negative values after truncation are treated as unlimited.
 *
 * When `maxMember` is unknown, pass `undefined` (not `null`).
 */
export function computeSpotsTotal(maxMember: number | undefined) {
  if (maxMember === undefined || !Number.isFinite(maxMember)) {
    return Infinity;
  }
  const normalized = Math.trunc(maxMember);
  if (normalized < 0) return Infinity;
  return normalized;
}
