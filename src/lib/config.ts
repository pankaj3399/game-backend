export const isProd = process.env.NODE_ENV === 'production';

/** Cookie sameSite: 'none' in prod (cross-domain), 'lax' in dev (works over HTTP). */
export const cookieSameSite = isProd ? ('none' as const) : ('lax' as const);
/**
 * Central backend configuration constants.
 */
export const TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_HOURS = 7 * 24;
/** Default ELO rating for new users. */
export const DEFAULT_ELO = { rating: 1500, tau: 0.5, rd: 200, vol: 0.06 } as const;
