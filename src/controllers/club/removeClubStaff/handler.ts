import { ok } from '../../../shared/helpers';
import type { RemoveClubStaffAccess } from './authenticate';
import { removeClubStaffTransaction } from './queries';

export async function removeClubStaffFlow(clubId: string, staffId: string, access: RemoveClubStaffAccess) {
	const tx = await removeClubStaffTransaction(clubId, staffId, access);
	if (!tx.ok) {
		return tx;
	}

	return ok(
		{
			message: 'Staff member removed successfully',
			staffId
		},
		{ status: 200, message: 'Club staff removed successfully' }
	);
}
