import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { updateProfileSchema } from '../../../validation/user.schemas';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema } from '../../../shared/validation';
import { updateProfileFlow } from './handler';

export async function updateProfile(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const parsed = parseBodyWithSchema(updateProfileSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await updateProfileFlow(session._id.toString(), parsed.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.message);
	} catch (err) {
		logger.error('Error updating profile', { err });
		res.status(500).json(buildErrorPayload('Failed to update profile'));
	}
}
