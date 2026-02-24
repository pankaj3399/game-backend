/** Cookie sameSite: 'lax' for same-site, 'none' for cross-domain (requires Secure). */
export const cookieSameSite =
	(process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax';

export const isProd = process.env.NODE_ENV === 'production';
