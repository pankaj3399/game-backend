import type { SetClubMainAdminInput } from '../../../validation/club.schemas';
import { error, ok } from '../../../shared/helpers';
import type { SetClubMainAdminAccess } from './authenticate';
import { findClubStaffUserSnapshotById, updateClubDefaultAdmin } from '../shared/queries';

export async function setClubMainAdminFlow(
	clubId: string,
	payload: SetClubMainAdminInput,
	access: SetClubMainAdminAccess
) {
	if (access.currentDefaultAdminId === payload.userId) {
		return error(409, 'This user is already the main admin');
	}

	const user = await findClubStaffUserSnapshotById(payload.userId);
	if (!user) {
		return error(404, 'User not found');
	}

	const isAdmin = (user.adminOf ?? []).some((id) => id.toString() === clubId);
	if (!isAdmin) {
		return error(400, 'Only club admins can be set as main admin');
	}

	await updateClubDefaultAdmin(clubId, payload.userId);

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
}
