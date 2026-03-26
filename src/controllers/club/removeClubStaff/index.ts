import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseRouteObjectId } from '../../../shared/validation';
import { authenticateRemoveClubStaff } from './authenticate';
import { removeClubStaffFlow } from './handler';

export async function removeClubStaff(req: Request, res: Response){
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

		const staffIdResult = parseRouteObjectId(req.params.staffId, 'staff ID');
		if (staffIdResult.status !== 200) {
			res.status(staffIdResult.status).json(buildErrorPayload(staffIdResult.message));
			return;
		}

		const authResult = await authenticateRemoveClubStaff(clubIdResult.data, session);
		if (authResult.status !== 200) {
			res.status(authResult.status).json(buildErrorPayload(authResult.message));
			return;
		}

		const result = await removeClubStaffFlow(clubIdResult.data, staffIdResult.data, authResult.data);
		if (!result.ok) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error removing club staff', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
