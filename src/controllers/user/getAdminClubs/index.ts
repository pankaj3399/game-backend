import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { getAdminClubsFlow } from './handler';

export async function getAdminClubs(req: Request, res: Response){
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await getAdminClubsFlow(session._id.toString());
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error getting admin clubs', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
