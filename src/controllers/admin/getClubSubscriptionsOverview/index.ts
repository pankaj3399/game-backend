import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { getClubSubscriptionsOverviewFlow } from './handler';

export async function getClubSubscriptionsOverview(req: Request, res: Response) {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await getClubSubscriptionsOverviewFlow();
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error getting club subscriptions overview', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}