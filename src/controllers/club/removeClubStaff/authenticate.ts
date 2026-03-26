import { type AuthenticatedSession } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubStaffSnapshotById } from '../shared/queries';

export interface RemoveClubStaffAccess {
	canRemoveAdmins: boolean;
	defaultAdminId: string | null;
	organiserIds: string[];
}

export async function authenticateRemoveClubStaff(clubId: string, session: AuthenticatedSession) {
	const club = await findClubStaffSnapshotById(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const currentUserId = session._id.toString();
	const organiserIds = (club.organiserIds ?? []).map((id) => id.toString());
	const isSuperAdmin = session.role === 'super_admin';
	const isClubAdmin = (session.adminOf ?? []).some((id) => id.toString() === clubId);
	const isClubOrganiser = organiserIds.includes(currentUserId);

	if (!isSuperAdmin && !isClubAdmin && !isClubOrganiser) {
		return error(403, 'You do not have permission to manage this club');
	}

	return ok(
		{
			canRemoveAdmins: isSuperAdmin || isClubAdmin,
			defaultAdminId: club.defaultAdminId?.toString() ?? null,
			organiserIds
		},
		{ status: 200, message: 'Authorized for club staff removal' }
	);
}
