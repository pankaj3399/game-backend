import type { Request } from 'express';
import { userCanManageClubAsAdmin } from '../../../lib/permissions';
import { buildPermissionContext } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubById, findClubCourtsByClubId } from './queries';
import { logger } from '../../../lib/logger';

type Session = NonNullable<Request['user']>;

export async function getClubByIdFlow(clubId: string, session: Session) {
	try {
		const ctx = buildPermissionContext(session);
		if (!userCanManageClubAsAdmin(ctx, clubId)) {
			return error(403, 'You do not have permission to edit this club');
		}
	
		const club = await findClubById(clubId);
		if (!club) {
			return error(404, 'Club not found');
		}
	
		const courts = await findClubCourtsByClubId(clubId);
	
		const coords = club.coordinates?.coordinates;
	
		return ok({
			club: {
				id: club._id,
				name: club.name,
				address: club.address,
				website: club.website ?? null,
				bookingSystemUrl: club.bookingSystemUrl ?? null,
				coordinates: coords ? [coords[0], coords[1]] : null,
				plan: club.plan ?? 'free',
				expiresAt: club.expiresAt ?? null
			},
			courts: courts.map((court) => ({
				id: court._id,
				name: court.name,
				type: court.type,
				placement: court.placement
			}))
		},
		{ status: 200, message: 'Club found successfully' }
	);
	} catch (err) {
		logger.error('Error getting club by id', { err });
		return error(500, 'Internal server error');
	}
}
