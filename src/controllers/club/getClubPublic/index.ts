import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseRouteObjectId } from '../../../shared/validation';
import { getClubPublicFlow } from './handler';

export async function getClubPublic(req: Request, res: Response): Promise<void> {
	try {
		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const result = await getClubPublicFlow(clubIdResult.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error getting public club details', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
