/**
 * Normalized capacity from `maxMember` for join rules and detail `permissions.canJoin`.
 * Undefined, null, non-finite, or negative values after truncation yield 0.
 */
export function computeSpotsTotal(maxMember: number | undefined | null) {
  if (maxMember === undefined || maxMember === null || !Number.isFinite(maxMember)) {
    return 0;
  }
  return Math.max(0, Math.trunc(maxMember));
}
