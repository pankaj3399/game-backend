import mongoose from 'mongoose';
import { error, ok } from '../../../shared/helpers';
import {
	findActiveClubPublicById,
	findClubCourtsForPublicView,
	findActiveClubSponsorsForPublicView
} from './queries';

const SURFACE_LABELS: Record<string, string> = {
	concrete: 'Concrete',
	clay: 'Clay',
	hard: 'Hard',
	grass: 'Grass',
	carpet: 'Carpet',
	other: 'Other'
};

export async function getClubPublicFlow(clubId: string) {

	const club = await findActiveClubPublicById(clubId);

	if (!club) {
		return error(404, 'Club not found');
	}

	const courtsPromise = findClubCourtsForPublicView(clubId);

	const sponsorsPromise =
		club.plan === 'premium' ? findActiveClubSponsorsForPublicView(clubId) : Promise.resolve([]);

	const [courts, sponsors] = await Promise.all([courtsPromise, sponsorsPromise]);

	const courtGroups = new Map<'outdoor' | 'indoor', Map<string, number>>();
	courtGroups.set('outdoor', new Map());
	courtGroups.set('indoor', new Map());

	for (const court of courts) {
		const surface = SURFACE_LABELS[court.type] ?? court.type;
		const placementMap = courtGroups.get(court.placement)!;
		placementMap.set(surface, (placementMap.get(surface) ?? 0) + 1);
	}

	const groupedCourts = (['outdoor', 'indoor'] as const)
		.map((placement) => {
			const grouped = courtGroups.get(placement)!;
			const count = [...grouped.values()].reduce((sum, value) => sum + value, 0);
			if (count === 0) {
				return null;
			}

			const surface = [...grouped.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([value]) => value)
				.join(', ');

			return { placement, count, surface };
		})
		.filter((value): value is { placement: 'outdoor' | 'indoor'; count: number; surface: string } => value !== null);

	return ok({
		club: {
			id: club._id.toString(),
			name: club.name,
			description: club.description ?? null,
			address: club.address,
			website: club.website ?? null,
			bookingSystemUrl: club.bookingSystemUrl ?? null,
			courtCount: courts.length,
			courts: groupedCourts,
			sponsors:
				club.plan === 'premium'
					? sponsors.map((sponsor) => ({
							id: sponsor._id.toString(),
							name: sponsor.name,
							logoUrl: sponsor.logoUrl ?? null,
							link: sponsor.link ?? null
					  }))
					: []
		}
	},
	{ status: 200, message: 'Club found successfully' }
);
}
