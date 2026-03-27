import type mongoose from 'mongoose';
import Club, { type ClubPlan } from '../../../models/Club';
import { findClubMemberCountsByClub } from '../../user/getAdminClubs/queries';

type ClubSubscriptionOverviewClubDoc = {
	_id: mongoose.Types.ObjectId;
	name: string;
	plan: ClubPlan;
	expiresAt: Date | null;
	renewalRequestedAt: Date | null;
};

export async function findClubsForSubscriptionsOverview() {
	const clubs = await Club.find({ status: 'active' })
		.select('_id name plan expiresAt renewalRequestedAt')
		.sort({ name: 1 })
		.lean<ClubSubscriptionOverviewClubDoc[]>()
		.exec();

	const clubIds = clubs.map((club) => club._id);
	const memberCountByClubId = await findClubMemberCountsByClub(clubIds);

	return { clubs, memberCountByClubId };
}