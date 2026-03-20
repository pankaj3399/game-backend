import Club from '../../../models/Club';

export async function findClubSubscriptionByIdForUpdate(clubId: string) {
	return Club.findById(clubId).exec();
}
