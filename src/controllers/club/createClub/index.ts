import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema } from '../../../shared/validation';
import { createClubSchema } from '../../../validation/club.schemas';
import { createClubFlow } from './handler';

export async function createClub(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const parsed = parseBodyWithSchema(createClubSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await createClubFlow(parsed.data, session._id.toString());
		if (result.status !== 201) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(201).json(result.data);
	} catch (err) {
		logger.error('Error creating club', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
