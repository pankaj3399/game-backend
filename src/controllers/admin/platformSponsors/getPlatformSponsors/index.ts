import type { Request, Response } from 'express';
import { logger } from '../../../../lib/logger';
import { buildErrorPayload } from '../../../../shared/errors';
import { getPlatformSponsorsFlow } from './handler';

export async function getPlatformSponsors(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await getPlatformSponsorsFlow();
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (error) {
		logger.error('Error getting platform sponsors', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
