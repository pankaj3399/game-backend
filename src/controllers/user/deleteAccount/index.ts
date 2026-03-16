import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { deleteAccountFlow } from './handler';

export async function deleteAccount(req: Request, res: Response) {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await deleteAccountFlow(session._id.toString());
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json({ message: result.message });
	} catch (err) {
		logger.error('Error deleting account', { err });
		res.status(500).json(buildErrorPayload('Failed to delete account'));
	}
}
