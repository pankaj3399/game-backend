import Sponsor from '../../../models/Sponsor';
import { ok } from '../../../shared/helpers';
import { mapPublicSponsorListItem, type SponsorListDoc } from './mapper';

export async function getAllSponsorsFlow() {
	const sponsors = await Sponsor.find({ status: 'active' })
		.select('name description logoUrl link')
		.lean<SponsorListDoc[]>()
		.exec();

	const seen = new Set<string>();
	const unique: SponsorListDoc[] = [];

	for (const sponsor of sponsors) {
		const key = `${sponsor.name}:${sponsor.link ?? ''}`;

		if (!seen.has(key)) {
			seen.add(key);
			unique.push(sponsor);
		}
	}

	return ok(
		{
			sponsors: unique.map((sponsor) =>
				mapPublicSponsorListItem(sponsor)
			)
		},
		{ status: 200, message: 'Fetched sponsors' }
	);
}