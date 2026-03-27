import mongoose from 'mongoose';
import { error } from '../../../shared/helpers';
import type { UpdateClubStaffRoleInput } from '../../../validation/club.schemas';
import type { UpdateClubStaffRoleAccess } from './authenticate';
import {
	addUserAdminOfClub,
	addUserAsClubOrganiser,
	findClubStaffSnapshotById,
	findClubStaffUserSnapshotById,
	removeUserAdminOfClub,
	removeUserAsClubOrganiser
} from '../shared/queries';

type StaffUserSnapshot = NonNullable<Awaited<ReturnType<typeof findClubStaffUserSnapshotById>>>;

export type UpdateClubStaffRoleAtomicResult =
	| { ok: true; user: StaffUserSnapshot }
	| ReturnType<typeof error>;

/**
 * Applies staff role changes atomically: re-reads club (default admin, organisers) and user
 * (adminOf) inside one transaction, then runs the required User/Club updates together.
 */
export async function updateClubStaffRoleAtomic(
	clubId: string,
	staffId: string,
	payload: UpdateClubStaffRoleInput,
	access: Pick<UpdateClubStaffRoleAccess, 'canManageOrganisers' | 'canManageAdmins'>
): Promise<UpdateClubStaffRoleAtomicResult> {
	const session = await mongoose.startSession();
	try {
		return await session.withTransaction(async () => {
			const club = await findClubStaffSnapshotById(clubId, session);
			if (!club) {
				return error(404, 'Club not found');
			}

			const defaultAdminId = club.defaultAdminId?.toString() ?? null;
			if (defaultAdminId === staffId) {
				return error(400, 'Cannot change role of the default admin');
			}

			const organiserIds = (club.organiserIds ?? []).map((id) => id.toString());
			const user = await findClubStaffUserSnapshotById(staffId, session);
			if (!user) {
				return error(404, 'User not found');
			}

			const isAdmin = (user.adminOf ?? []).some((id) => id.toString() === clubId);
			const isOrganiser = organiserIds.includes(staffId);

			if (!isAdmin && !isOrganiser) {
				return error(404, 'Staff member not found in this club');
			}

			if (payload.role === 'admin' && !access.canManageAdmins) {
				return error(403, 'Only the main admin can assign the admin role');
			}

			if (payload.role === 'organiser' && !access.canManageOrganisers) {
				return error(403, 'Only club admins can manage organisers');
			}

			if (payload.role === 'organiser' && isAdmin && !access.canManageAdmins) {
				return error(403, 'Only the main admin can change admin roles');
			}

			if (payload.role === 'admin' && isAdmin && !isOrganiser) {
				return error(409, 'User already has this role');
			}

			if (payload.role === 'organiser' && !isAdmin && isOrganiser) {
				return error(409, 'User already has this role');
			}

			if (payload.role === 'admin') {
				if (!isAdmin) {
					await addUserAdminOfClub(clubId, staffId, session);
				}
				if (isOrganiser) {
					await removeUserAsClubOrganiser(clubId, staffId, session);
				}
			} else {
				if (!isOrganiser) {
					await addUserAsClubOrganiser(clubId, staffId, session);
				}
				if (isAdmin) {
					await removeUserAdminOfClub(clubId, staffId, session);
				}
			}

			return { ok: true as const, user };
		});
	} finally {
		await session.endSession().catch(() => {});
	}
}
