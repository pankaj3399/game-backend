import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema, parseRouteObjectId } from '../../../shared/validation';
import { setClubMainAdminSchema } from '../../../validation/club.schemas';
import { authenticateSetClubMainAdmin } from './authenticate';
import { setClubMainAdminFlow } from './handler';

export async function setClubMainAdmin(req: Request, res: Response): Promise<void> {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const parsed = parseBodyWithSchema(setClubMainAdminSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const authResult = await authenticateSetClubMainAdmin(clubIdResult.data, session);
		if (authResult.status !== 200) {
			res.status(authResult.status).json(buildErrorPayload(authResult.message));
			return;
		}

		const result = await setClubMainAdminFlow(clubIdResult.data, parsed.data, authResult.data);
		if (result.status !== 200) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error setting club main admin', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
