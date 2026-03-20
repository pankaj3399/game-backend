import type { Request, Response } from 'express';
import { logger } from '../../../../lib/logger';
import { buildErrorPayload } from '../../../../shared/errors';
import { parseRouteObjectId } from '../../../../shared/validation';
import { deletePlatformSponsorFlow } from './handler';

export async function deletePlatformSponsor(req: Request, res: Response): Promise<void> {
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

		const result = await deletePlatformSponsorFlow(sponsorIdResult.data);
		if (result.status !== 204) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(204).send();
	} catch (err) {
		logger.error('Error deleting platform sponsor', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
