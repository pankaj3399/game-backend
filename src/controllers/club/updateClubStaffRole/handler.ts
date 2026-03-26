import type { UpdateClubStaffRoleInput } from '../../../validation/club.schemas';
import { error, ok } from '../../../shared/helpers';
import type { UpdateClubStaffRoleAccess } from './authenticate';
import {
	addUserAdminOfClub,
	addUserAsClubOrganiser,
	findClubStaffUserSnapshotById,
	removeUserAdminOfClub,
	removeUserAsClubOrganiser
} from '../shared/queries';

export async function updateClubStaffRoleFlow(
	clubId: string,
	staffId: string,
	payload: UpdateClubStaffRoleInput,
	access: UpdateClubStaffRoleAccess
) {
	if (access.defaultAdminId === staffId) {
		return error(400, 'Cannot change role of the default admin');
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

	if (payload.role === 'admin' && !access.canAssignAdminRole) {
		return error(403, 'Only club admins can assign the admin role');
	}

	if (payload.role === 'organiser' && isAdmin && !access.canAssignAdminRole) {
		return error(403, 'Only club admins can change admin roles');
	}

	if (payload.role === 'admin' && isAdmin && !isOrganiser) {
		return error(409, 'User already has this role');
	}

	if (payload.role === 'organiser' && !isAdmin && isOrganiser) {
		return error(409, 'User already has this role');
	}

	if (payload.role === 'admin') {
		if (!isAdmin) {
			await addUserAdminOfClub(staffId, clubId);
		}

		if (isOrganiser) {
			await removeUserAsClubOrganiser(clubId, staffId);
		}
	} else {
		if (!isOrganiser) {
			await addUserAsClubOrganiser(clubId, staffId);
		}

		if (isAdmin) {
			await removeUserAdminOfClub(staffId, clubId);
		}
	}

	return ok(
		{
			message: 'Staff role updated successfully',
			staff: {
				id: user._id.toString(),
				email: user.email,
				name: user.name ?? null,
				alias: user.alias ?? null,
				role: payload.role,
				roleLabel: payload.role === 'admin' ? 'Admin' : 'Organiser'
			}
		},
		{ status: 200, message: 'Club staff updated successfully' }
	);
}
