import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseRouteObjectId } from '../shared/validation';
import { authorizeGetClubSponsors } from './authorize';
import { getClubSponsorsFlow } from './handler';

export async function getClubSponsors(req: Request, res: Response): Promise<void> {
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

		const authorization = await authorizeGetClubSponsors(session, clubIdResult.data);
		if (authorization.status !== 200) {
			res.status(authorization.status).json(buildErrorPayload(authorization.message));
			return;
		}

		const result = await getClubSponsorsFlow(clubIdResult.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.json(result.data);
	} catch (error) {
		logger.error('Error getting club sponsors', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
