import type { Types } from 'mongoose';
import Club from '../../../models/Club';
import { escapeRegex } from '../../../lib/validation';

type ClubsSearchFilter = {
	status: 'active';
	name?: {
		$regex: string;
		$options: 'i';
	};
	_id?: { $in: Types.ObjectId[] };
};

function buildActiveClubsFilter(q?: string, allowedClubIds?: Types.ObjectId[]): ClubsSearchFilter {
	const filter: ClubsSearchFilter = { status: 'active' };

	if (allowedClubIds !== undefined) {
		filter._id = { $in: allowedClubIds };
	}

	if (q?.trim()) {
		filter.name = {
			$regex: escapeRegex(q.trim()),
			$options: 'i'
		};
	}

	return filter;
}

export type ClubListItem = {
	_id: Types.ObjectId;
	name: string;
	address: string;
	logoUrl?: string | null;
	website?: string | null;
};

type FacetResult = {
	totalCount: { count: number }[];
	data: ClubListItem[];
};

/**
 * Paginated active clubs plus total count in one aggregation ($facet), so the
 * matched set is not evaluated separately for count and find.
 */
export async function listActiveClubsPage(
	skip: number,
	limit: number,
	q?: string,
	options?: { allowedClubIds?: Types.ObjectId[] }
): Promise<{ totalCount: number; clubs: ClubListItem[] }> {
	if (options?.allowedClubIds !== undefined && options.allowedClubIds.length === 0) {
		return { totalCount: 0, clubs: [] };
	}

	const filter = buildActiveClubsFilter(q, options?.allowedClubIds);

	const [result] = await Club.aggregate<FacetResult>([
		{ $match: filter },
		{
			$facet: {
				totalCount: [{ $count: 'count' }],
				data: [
					{ $sort: { name: 1 } },
					{ $skip: skip },
					{ $limit: limit },
					{
						$project: {
							_id: 1,
							name: 1,
							address: 1,
							logoUrl: 1,
							website: 1
						}
					}
				]
			}
		}
	]).exec();

	const totalCount = result?.totalCount[0]?.count ?? 0;
	const clubs = result?.data ?? [];

	return { totalCount, clubs };
}
