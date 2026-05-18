import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema, parseRouteObjectId } from '../../../shared/validation';
import { getMyScoreFlow } from '../getMyScore/handler';
import { myScoreQuerySchema } from '../getMyScore/validation';

/**
 * GET /api/players/:userId/score
 * Public score history for a player (used by shared links).
 */
export async function getPlayerScore(req: Request, res: Response) {
	try {
		const userIdResult = parseRouteObjectId(req.params.userId, 'user ID');
		if (userIdResult.status !== 200) {
			res.status(userIdResult.status).json(buildErrorPayload(userIdResult.message));
			return;
		}

		const parsed = parseQueryWithSchema(myScoreQuerySchema, req.query);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await getMyScoreFlow(userIdResult.data, parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error fetching player score', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
