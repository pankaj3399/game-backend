import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseRouteObjectId } from '../shared/validation';
import { authorizeDeleteSponsor } from './authorize';
import { deleteSponsorFlow } from './handler';

export async function deleteSponsor(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}
		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const sponsorIdResult = parseRouteObjectId(req.params.sponsorId, 'sponsor ID');
		if (sponsorIdResult.status !== 200) {
			res.status(sponsorIdResult.status).json(buildErrorPayload(sponsorIdResult.message));
			return;
		}

		const authorization = await authorizeDeleteSponsor(session, clubIdResult.data);
		if (authorization.status !== 200) {
			res.status(authorization.status).json(buildErrorPayload(authorization.message));
			return;
		}

		const result = await deleteSponsorFlow(clubIdResult.data, sponsorIdResult.data);
		if (result.status !== 204) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(204).send();
	} catch (error) {
		logger.error('Error deleting sponsor', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
