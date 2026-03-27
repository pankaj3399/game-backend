import type { ClientSession } from 'mongoose';
import Club from '../../../models/Club';
export {
	addUserAdminOfClub,
	addUserAsClubOrganiser,
	findClubStaffSnapshotById,
	findClubStaffUserSnapshotById,
	findUserById
} from '../shared/queries';

export async function findClubPlanById(clubId: string, session?: ClientSession | null) {
	let query = Club.findById(clubId).select('plan defaultAdminId');
	if (session) {
		query = query.session(session);
	}
	return query.exec();
}
