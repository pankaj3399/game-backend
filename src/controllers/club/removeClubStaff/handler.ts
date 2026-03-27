import { ok } from '../../../shared/helpers';
import { removeClubStaffTransaction } from './queries';

export async function removeClubStaffFlow(clubId: string, staffId: string, actorUserId: string) {
	const tx = await removeClubStaffTransaction(clubId, staffId, actorUserId);
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
