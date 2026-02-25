import type { Request, Response } from 'express';
import { clearAuthCookie, extractAuthToken } from '../../lib/jwtAuth';
import Session from '../../models/Session';
import { logger } from '../../lib/logger';

export function logout(req: Request, res: Response): void {
	const token = extractAuthToken(req);
	if (token) {
		Session.deleteOne({ token }).exec().catch((err) => {
			logger.error('Error deleting session on logout', { err });
		});
	}
	clearAuthCookie(res);
	res.json({ message: 'Logged out successfully' });
}
