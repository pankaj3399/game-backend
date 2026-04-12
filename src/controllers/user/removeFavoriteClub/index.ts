import type { Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseRouteObjectId } from '../../../shared/validation';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { removeFavoriteClubFlow } from './handler';

export async function removeFavoriteClub(req: AuthenticatedRequest, res: Response){
	try {
		const session = req.user;

		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const result = await removeFavoriteClubFlow(session._id.toString(), clubIdResult.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.message);
	} catch (err) {
		logger.error('Error removing favorite club', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
