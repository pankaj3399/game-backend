import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema } from '../../../shared/validation';
import { searchClubsQuerySchema } from './validation';
import { searchClubsFlow } from './handler';

export async function searchClubs(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const parsed = parseQueryWithSchema(searchClubsQuerySchema, req.query);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await searchClubsFlow(parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error searching clubs', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
