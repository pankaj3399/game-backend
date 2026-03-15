import Club from '../../../models/Club';
import Sponsor from '../../../models/Sponsor';
import { error, ok } from '../../shared/helpers';
import { mapClubSponsorItem, mapSponsorStatusSummary, type SponsorListDoc } from './mapper';

export async function getClubSponsorsFlow(club: string) {
	const clubData = await Club.findById(club).select('plan').lean().exec();
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
	const isPremium = plan === 'premium';

	return ok(
		{
			sponsors: sponsors.map((sponsor) => mapClubSponsorItem(sponsor, isPremium)),
			subscription: mapSponsorStatusSummary(plan)
		},
		{ status: 200, message: 'Fetched club sponsors' }
	);
}
