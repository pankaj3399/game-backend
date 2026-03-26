import { error, ok } from '../../../shared/helpers';
import type { RemoveClubStaffAccess } from './authenticate';
import {
	findClubStaffUserSnapshotById,
	removeUserAdminOfClub,
	removeUserAsClubOrganiser
} from '../shared/queries';

export async function removeClubStaffFlow(clubId: string, staffId: string, access: RemoveClubStaffAccess) {
	if (access.defaultAdminId === staffId) {
		return error(400, 'Cannot remove the default admin');
	}

	const user = await findClubStaffUserSnapshotById(staffId);
	if (!user) {
		return error(404, 'User not found');
	}

	const isAdmin = (user.adminOf ?? []).some((id) => id.toString() === clubId);
	const isOrganiser = access.organiserIds.includes(staffId);

	if (!isAdmin && !isOrganiser) {
		return error(404, 'Staff member not found in this club');
	}

	if (isAdmin && !access.canRemoveAdmins) {
		return error(403, 'Only club admins can remove admins');
	}

	if (isAdmin) {
		await removeUserAdminOfClub(staffId, clubId);
	}

	if (isOrganiser) {
		await removeUserAsClubOrganiser(clubId, staffId);
	}

	return ok(
		{
			message: 'Staff member removed successfully',
			staffId
		},
		{ status: 200, message: 'Club staff removed successfully' }
	);
}
