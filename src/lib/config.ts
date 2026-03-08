export const isProd = process.env.NODE_ENV === 'production';

/** Cookie sameSite: 'none' in prod (cross-domain), 'lax' in dev (works over HTTP). */
export const cookieSameSite = isProd ? ('none' as const) : ('lax' as const);
