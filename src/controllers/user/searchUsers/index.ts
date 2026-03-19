import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseQueryWithSchema } from '../../../shared/validation';
import { searchUsersFlow } from './handler';
import { searchUsersQuerySchema } from './validation';

export async function searchUsers(req: Request, res: Response){
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const parsed = parseQueryWithSchema(searchUsersQuerySchema, req.query);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await searchUsersFlow(session.role, parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error searching users', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
