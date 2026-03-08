import type { Request, Response } from 'express';
import { clearAuthCookie, extractAuthToken, hashSessionToken } from '../../lib/jwtAuth';
import Session from '../../models/Session';
import { logger } from '../../lib/logger';

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
