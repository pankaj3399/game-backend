import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema } from '../../../shared/validation';
import { listClubsQuerySchema } from './validation';
import { listClubsFlow } from './handler';

export async function listClubs(req: Request, res: Response) {
	try {
		const session = req.user;

		const parsed = parseQueryWithSchema(listClubsQuerySchema, req.query);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const userId = session?._id?.toString() ?? null;
		const result = await listClubsFlow(parsed.data, userId);
		if (!result.ok) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error listing clubs', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
