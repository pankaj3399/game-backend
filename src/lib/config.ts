export const isProd = process.env.NODE_ENV === 'production';

/** Cookie sameSite: 'none' in prod (cross-domain), 'lax' in dev (works over HTTP). */
export const cookieSameSite = isProd ? ('none' as const) : ('lax' as const);

/**
 * Days after `Tournament.completedAt` when organisers may still adjust match scores (all rounds).
 * Set via TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_DAYS; defaults to 14.
 */
export function getTournamentOrganiserScoreEditGraceDays(): number {
  const raw = process.env.TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_DAYS;
  if (raw == null || raw.trim() === "") {
    return 7;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    return 7;
  }
  return Math.min(3650, n);
}
