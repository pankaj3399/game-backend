import type { Request, Response } from 'express';
import { logger } from '../../../../lib/logger';
import { buildErrorPayload } from '../../../../shared/errors';
import { parseBodyWithSchema, parseRouteObjectId } from '../../../../shared/validation';
import { updatePlatformSponsorSchema } from '../shared/validation';
import { updatePlatformSponsorFlow } from './handler';

export async function updatePlatformSponsor(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const sponsorIdResult = parseRouteObjectId(req.params.sponsorId, 'sponsor ID');
		if (sponsorIdResult.status !== 200) {
			res.status(sponsorIdResult.status).json(buildErrorPayload(sponsorIdResult.message));
			return;
		}

		const parsed = parseBodyWithSchema(updatePlatformSponsorSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await updatePlatformSponsorFlow(sponsorIdResult.data, parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data.sponsor);
	} catch (error) {
		logger.error('Error updating platform sponsor', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
