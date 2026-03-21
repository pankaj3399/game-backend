import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { createSponsorSchema } from '../../../validation/sponsor.schemas';
import { parseBodyWithSchema, parseRouteObjectId } from '../shared/validation';
import { authorizeCreateSponsor } from './authorize';
import { createSponsorFlow } from './handler';

export async function createSponsor(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const parsed = parseBodyWithSchema(createSponsorSchema, req.body);
		if (parsed.status !== 200) {
			logger.error('Invalid request body', { errors: parsed.message });
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const authorization = await authorizeCreateSponsor(session, clubIdResult.data);
		if (authorization.status !== 200) {
			res.status(authorization.status).json(buildErrorPayload(authorization.message));
			return;
		}

		const result = await createSponsorFlow(parsed.data, clubIdResult.data);
		if (result.status !== 201) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(result.status).json(result.data.sponsor);
	} catch (error) {
		logger.error('Error creating sponsor', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
