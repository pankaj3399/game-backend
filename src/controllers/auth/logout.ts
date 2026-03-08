import type { Request, Response } from 'express';
import { clearAuthCookie, extractAuthToken, hashSessionToken } from '../../lib/jwtAuth';
import Session from '../../models/Session';
import { logger } from '../../lib/logger';

/**
 * Clears any existing session and auth cookie. Does not send a response.
 * Use when initiating a new login (e.g. OAuth) so a different account can sign in.
 */
export function clearExistingSession(req: Request, res: Response): void {
	const token = extractAuthToken(req);
	if (token) {
		Session.deleteOne({
			$or: [{ tokenHash: hashSessionToken(token) }, { token }],
		}).exec().catch((err: unknown) => {
			logger.error('Error deleting session when clearing for new login', { err });
		});
	}
	clearAuthCookie(res);
}

export function logout(req: Request, res: Response): void {
	const token = extractAuthToken(req);
	if (token) {
		Session.deleteOne({
			$or: [{ tokenHash: hashSessionToken(token) }, { token }],
		}).exec().catch((err: unknown) => {
			logger.error('Error deleting session on logout', { err });
		});
	}
	clearAuthCookie(res);
	res.json({ message: 'Logged out successfully' });
}
