import type { Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { deleteAccountFlow } from './handler';

export async function deleteAccount(req: AuthenticatedRequest, res: Response) {
	try {
		const session = req.user;

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
