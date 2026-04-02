import mongoose from 'mongoose';
import User from '../../../models/User';
import { computeClubStaffPermissionsForActor } from '../../../shared/clubStaffPermissions';
import { error } from '../../../shared/helpers';
import {
	findClubStaffSnapshotById,
	findClubStaffUserSnapshotById,
	removeUserAdminOfClub,
	removeUserAsClubOrganiser
} from '../shared/queries';

export type RemoveClubStaffTransactionResult = { ok: true } | ReturnType<typeof error>;

/**
 * Re-reads club (default admin, organisers) and user (adminOf) inside one transaction,
 * validates rules, then applies User/Club removals together.
 */
export async function removeClubStaffTransaction(
	clubId: string,
	staffId: string,
	actorUserId: string
): Promise<RemoveClubStaffTransactionResult> {
	const session = await mongoose.startSession();
	try {
		return await session.withTransaction(async () => {
			const club = await findClubStaffSnapshotById(clubId, session);
			if (!club) {
				return error(404, 'Club not found');
			}

			const defaultAdminId = club.defaultAdminId?.toString() ?? null;

			const actorDoc = await User.findById(actorUserId)
				.select('role adminOf')
				.session(session)
				.lean()
				.exec();
			if (!actorDoc) {
				return error(403, 'You do not have permission to manage this club');
			}

			const base = computeClubStaffPermissionsForActor(club, clubId, {
				id: actorDoc._id.toString(),
				role: actorDoc.role,
				adminOf: actorDoc.adminOf
			});
			if (!base.ok) {
				return error(403, 'You do not have permission to manage this club');
			}

			const access = {
				canManageOrganisers: base.canManageOrganisers,
				canManageAdmins: base.canManageAdmins
			};

			const isDefaultAdminTarget = defaultAdminId === staffId;

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

			if (isAdmin && isDefaultAdminTarget) {
				return error(
					403,
					'Cannot remove the default admin. Assign a new default admin first, then remove this user.'
				);
			}

			if (isAdmin && !isDefaultAdminTarget && !access.canManageAdmins) {
				return error(403, 'Only the main admin can remove other admins');
			}

			if (isOrganiser && !access.canManageOrganisers) {
				return error(403, 'Only club admins can remove organisers');
			}

			if (isAdmin) {
				await removeUserAdminOfClub(clubId, staffId, session);
			}

			if (isOrganiser) {
				await removeUserAsClubOrganiser(clubId, staffId, session);
			}

			return { ok: true as const };
		});
	} finally {
		await session.endSession().catch(() => {});
	}
}
