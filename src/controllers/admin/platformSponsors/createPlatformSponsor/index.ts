import type { Request, Response } from 'express';
import { logger } from '../../../../lib/logger';
import { buildErrorPayload } from '../../../../shared/errors';
import { parseBodyWithSchema } from '../../../../shared/validation';
import { createPlatformSponsorSchema } from '../shared/validation';
import { createPlatformSponsorFlow } from './handler';

export async function createPlatformSponsor(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const parsed = parseBodyWithSchema(createPlatformSponsorSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await createPlatformSponsorFlow(parsed.data);
		if (result.status !== 201) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(201).json(result.data.sponsor);
	} catch (error) {
		logger.error('Error creating platform sponsor', { error });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
