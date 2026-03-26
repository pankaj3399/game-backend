import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema, parseRouteObjectId } from '../../../shared/validation';
import { updateClubStaffRoleSchema } from '../../../validation/club.schemas';
import { authenticateUpdateClubStaffRole } from './authenticate';
import { updateClubStaffRoleFlow } from './handler';

export async function updateClubStaffRole(req: Request, res: Response): Promise<void> {
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

		const parsed = parseBodyWithSchema(updateClubStaffRoleSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const authResult = await authenticateUpdateClubStaffRole(clubIdResult.data, session);
		if (authResult.status !== 200) {
			res.status(authResult.status).json(buildErrorPayload(authResult.message));
			return;
		}

		const result = await updateClubStaffRoleFlow(clubIdResult.data, staffIdResult.data, parsed.data, authResult.data);
		if (!result.ok) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error updating club staff role', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
