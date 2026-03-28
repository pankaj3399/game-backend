import Club from '../../../models/Club';
import Sponsor from '../../../models/Sponsor';
import { hasEffectivePremiumAccess } from '../../../lib/subscription';
import { error, ok } from '../../../shared/helpers';
import { mapClubSponsorItem, mapSponsorStatusSummary, type SponsorListDoc } from './mapper';

export async function getClubSponsorsFlow(club: string) {
	const clubData = await Club.findById(club).select('plan expiresAt trialPremiumUntil').lean().exec();
	if (!clubData) {
		return error(404, 'Club not found');
	}

	const sponsors = await Sponsor.find({
		scope: 'club',
		club: club
	})
		.lean<SponsorListDoc[]>()
		.exec();

	const plan = clubData.plan;
	const isPremium = hasEffectivePremiumAccess(plan, clubData.expiresAt, clubData.trialPremiumUntil);

	return ok(
		{
			sponsors: sponsors.map((sponsor) => mapClubSponsorItem(sponsor, isPremium)),
			subscription: mapSponsorStatusSummary(plan, isPremium)
		},
		{ status: 200, message: 'Fetched club sponsors' }
	);
}
