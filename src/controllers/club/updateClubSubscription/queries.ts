import Club from '../../../models/Club';

export async function findClubSubscriptionByIdForRenewal(clubId: string) {
	return Club.findById(clubId)
		.select('plan expiresAt trialPremiumUntil renewalRequestedAt __v')
		.exec();
}