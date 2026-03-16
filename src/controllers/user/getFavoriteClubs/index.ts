import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { getFavoriteClubsFlow } from './handler';

export async function getFavoriteClubs(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await getFavoriteClubsFlow(session._id.toString());
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error getting favorite clubs', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
