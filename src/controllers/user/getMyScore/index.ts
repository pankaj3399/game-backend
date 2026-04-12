import type { Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema } from '../../../shared/validation';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { getMyScoreFlow } from './handler';
import { myScoreQuerySchema } from './validation';

/**
 * GET /api/user/my-score
 * Returns authenticated user's score history and summary cards.
 */
export async function getMyScore(req: AuthenticatedRequest, res: Response) {
	try {
		const session = req.user;

		const parsed = parseQueryWithSchema(myScoreQuerySchema, req.query);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await getMyScoreFlow(session._id.toString(), parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error fetching my score', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
