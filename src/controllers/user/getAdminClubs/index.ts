import type { Response } from 'express';
import { z } from 'zod';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema } from '../../../shared/validation';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { getAdminClubsFlow } from './handler';

const getAdminClubsQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).optional(),
	offset: z.coerce.number().int().min(0).optional(),
	page: z.coerce.number().int().min(1).optional()
});

export async function getAdminClubs(req: AuthenticatedRequest, res: Response){
	try {
		const session = req.user;

		const parsedQuery = parseQueryWithSchema(getAdminClubsQuerySchema, req.query);
		if (parsedQuery.status !== 200) {
			res.status(parsedQuery.status).json(buildErrorPayload(parsedQuery.message));
			return;
		}

		const result = await getAdminClubsFlow(session._id.toString(), parsedQuery.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error getting admin clubs', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
