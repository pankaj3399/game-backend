import { type AuthenticatedSession } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubStaffSnapshotById } from '../shared/queries';

export interface SetClubMainAdminAccess {
	currentDefaultAdminId: string | null;
}

export async function authenticateSetClubMainAdmin(clubId: string, session: AuthenticatedSession) {
	const club = await findClubStaffSnapshotById(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const currentUserId = session._id.toString();
	const currentDefaultAdminId = club.defaultAdminId?.toString() ?? null;
	const isSuperAdmin = session.role === 'super_admin';
	const isCurrentMainAdmin = currentDefaultAdminId === currentUserId;

	if (!isSuperAdmin && !isCurrentMainAdmin) {
		return error(403, 'Only the main admin or a super admin can change the main admin');
	}

	return ok(
		{ currentDefaultAdminId },
		{ status: 200, message: 'Authorized for setting club main admin' }
	);
}
