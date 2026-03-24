import Club from '../../../models/Club';
import { escapeRegex } from '../../../lib/validation';

type ClubsSearchFilter = {
	status: 'active';
	name?: {
		$regex: string;
		$options: 'i';
	};
};

function buildActiveClubsFilter(q?: string): ClubsSearchFilter {
	const filter: ClubsSearchFilter = { status: 'active' };

	if (q?.trim()) {
		filter.name = {
			$regex: escapeRegex(q.trim()),
			$options: 'i'
		};
	}

	return filter;
}

export async function countActiveClubs(q?: string) {
	return Club.countDocuments(buildActiveClubsFilter(q)).exec();
}

export async function findActiveClubsPage(skip: number, limit: number, q?: string) {
	return Club.find(buildActiveClubsFilter(q))
		.select('_id name address website')
		.sort({ name: 1 })
		.skip(skip)
		.limit(limit)
		.lean()
		.exec();
}
