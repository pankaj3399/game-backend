import { type AuthenticatedSession } from '../../../shared/authContext';
import { computeClubStaffPermissions } from '../../../shared/clubStaffPermissions';
import { error, ok } from '../../../shared/helpers';
import { findClubStaffSnapshotById } from '../shared/queries';

export interface UpdateClubStaffRoleAccess {
	canManageOrganisers: boolean;
	canManageAdmins: boolean;
}

export async function authenticateUpdateClubStaffRole(clubId: string, session: AuthenticatedSession) {
	const club = await findClubStaffSnapshotById(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const base = computeClubStaffPermissions(session, club, clubId);
	if (!base.ok) {
		return error(403, 'You do not have permission to manage this club');
	}

	return ok(
		{
			canManageOrganisers: base.canManageOrganisers,
			canManageAdmins: base.canManageAdmins
		},
		{ status: 200, message: 'Authorized for club staff role update' }
	);
}
