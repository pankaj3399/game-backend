import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { updateSponsorSchema } from '../../../validation/sponsor.schemas';
import { parseBodyWithSchema, parseRouteObjectId } from '../shared/validation';
import { authorizeUpdateSponsor } from './authorize';
import { updateSponsorFlow } from './handler';

export async function updateSponsor(req: Request, res: Response): Promise<void> {
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

		const parsed = parseBodyWithSchema(updateSponsorSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const authorization = await authorizeUpdateSponsor(session, clubIdResult.data, sponsorIdResult.data);
		if (authorization.status !== 200) {
			res.status(authorization.status).json(buildErrorPayload(authorization.message));
			return;
		}

		const result = await updateSponsorFlow(parsed.data, authorization.data.clubPlan, authorization.data.sponsor);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data.sponsor);
	} catch (error) {
		logger.error('Error updating sponsor', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
