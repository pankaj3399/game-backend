import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { getAllSponsorsFlow } from './handler';

export async function getAllSponsors(req: Request, res: Response): Promise<void> {
	try {
		const result = await getAllSponsorsFlow();
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.json(result.data);
	} catch (error) {
		logger.error('Error getting all sponsors', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
