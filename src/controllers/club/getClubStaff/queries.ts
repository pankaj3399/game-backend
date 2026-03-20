import User from '../../../models/User';
import Club from '../../../models/Club';

export async function findClubStaffSnapshotById(clubId: string) {
	return Club.findById(clubId)
		.select('defaultAdminId organiserIds plan expiresAt')
		.lean()
		.exec();
}

export async function findClubAdmins(clubId: string) {
	return User.find({ adminOf: clubId }).select('_id email name alias').lean().exec();
}

export async function findOrganiserUsersByIds(userIds: string[]) {
	if (userIds.length === 0) {
		return [];
	}

	return User.find({ _id: { $in: userIds } }).select('_id email name alias').lean().exec();
}
