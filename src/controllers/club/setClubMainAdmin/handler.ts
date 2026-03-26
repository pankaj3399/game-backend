import mongoose from 'mongoose';
import type { SetClubMainAdminInput } from '../../../validation/club.schemas';
import { error, ok } from '../../../shared/helpers';
import type { SetClubMainAdminAccess } from './authenticate';
import { findClubStaffUserSnapshotById, transferClubDefaultAdminIfExpected } from '../shared/queries';

export async function setClubMainAdminFlow(
	clubId: string,
	payload: SetClubMainAdminInput,
	access: SetClubMainAdminAccess
) {
	if (access.currentDefaultAdminId === payload.userId) {
		return error(409, 'This user is already the main admin');
	}

	const session = await mongoose.startSession();
	try {
		const transfer = await session.withTransaction(async (tx) =>
			transferClubDefaultAdminIfExpected(
				clubId,
				payload.userId,
				access.currentDefaultAdminId,
				tx
			)
		);

		if (transfer === 'club_not_found') {
			return error(404, 'Club not found');
		}
		if (transfer === 'target_not_admin') {
			return error(400, 'Only club admins can be set as main admin');
		}
		if (transfer === 'stale_main_admin') {
			return error(409, 'Main admin was changed by another request; refresh and try again');
		}

		const user = await findClubStaffUserSnapshotById(payload.userId);
		if (!user) {
			return error(404, 'User not found');
		}

		return ok(
			{
				message: 'Main admin updated successfully',
				staff: {
					id: user._id.toString(),
					email: user.email,
					name: user.name ?? null,
					alias: user.alias ?? null,
					role: 'default_admin',
					roleLabel: 'Main Admin'
				}
			},
			{ status: 200, message: 'Club main admin updated successfully' }
		);
	} finally {
		await session.endSession();
	}
}
