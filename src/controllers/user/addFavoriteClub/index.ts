import type { Response } from 'express';
import { logger } from '../../../lib/logger';
import { addFavoriteClubSchema } from '../../../validation/user.schemas';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema } from '../../../shared/validation';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { addFavoriteClubFlow } from './handler';

export async function addFavoriteClub(req: AuthenticatedRequest, res: Response): Promise<void> {
	try {
		const session = req.user;

		const parsed = parseBodyWithSchema(addFavoriteClubSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await addFavoriteClubFlow(session._id.toString(), parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.message);
	} catch (err) {
		logger.error('Error adding favorite club', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
