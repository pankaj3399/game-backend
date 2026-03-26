import mongoose from 'mongoose';
import { error } from '../../../shared/helpers';
import type { RemoveClubStaffAccess } from './authenticate';
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
	access: Pick<RemoveClubStaffAccess, 'canRemoveAdmins'>
): Promise<RemoveClubStaffTransactionResult> {
	const session = await mongoose.startSession();
	try {
		return await session.withTransaction(async () => {
			const club = await findClubStaffSnapshotById(clubId, session);
			if (!club) {
				return error(404, 'Club not found');
			}

			const defaultAdminId = club.defaultAdminId?.toString() ?? null;
			if (defaultAdminId === staffId) {
				return error(400, 'Cannot remove the default admin');
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

			if (isAdmin && !access.canRemoveAdmins) {
				return error(403, 'Only club admins can remove admins');
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
