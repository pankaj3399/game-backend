import type { Request, Response } from 'express';
import { cookieSameSite, isProd } from '../../lib/config';
import { logger } from '../../lib/logger';

export function logout(req: Request, res: Response) {
	req.logout((err) => {
		if (err) {
			logger.error("Error in logout", { err });
			return res.status(500).json({ message: 'Logout failed' });
		}
		req.session.destroy((destroyErr) => {
			if (destroyErr) {
				logger.error("Error in logout session destroy", { destroyErr });
				return res.status(500).json({ message: 'Session destroy failed' });
			}
			res.clearCookie('connect.sid', {
				path: '/',
				httpOnly: true,
				secure: cookieSameSite === 'none' || isProd,
				sameSite: cookieSameSite
			});
			res.json({ message: 'Logged out successfully' });
		});
	});
}
