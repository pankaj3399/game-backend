import type { ListClubsQuery } from './validation';
import { ok,error} from '../../../shared/helpers';
import { listActiveClubsPage } from './queries';
import { logger } from '../../../lib/logger';
import { resolveAllowedClubIdsForList } from './resolveAllowedClubIds';

export async function listClubsFlow(query: ListClubsQuery, userId: string | null) {
	try{
		const { page, limit, q, clubScope, distance } = query;
		const skip = (page - 1) * limit;

		if (!userId) {
			if (clubScope !== 'all' || distance !== 'all') {
				return error(401, 'Authorization required');
			}
		}

		const resolved = userId
			? await resolveAllowedClubIdsForList(userId, { clubScope, distance })
			: { ok: true as const, allowedClubIds: undefined };
		if (!resolved.ok) {
			return error(resolved.status, resolved.message);
		}

		const { totalCount, clubs } = await listActiveClubsPage(skip, limit, q, {
			allowedClubIds: resolved.allowedClubIds
		});
	
		const totalPages = Math.max(1, Math.ceil(totalCount / limit));
	
		return ok({
			clubs: clubs.map((club) => ({
				id: club._id.toString(),
				name: club.name,
				address: club.address,
				logoUrl: club.logoUrl ?? null,
				website: club.website ?? null
			})),
			pagination: {
				page,
				limit,
				totalCount,
				totalPages
			}
		},
		{ status: 200, message: 'Clubs listed successfully' }
	);

	}catch (err) {
		logger.error('Error listing clubs', { err });
		return error(500, 'Internal server error');
	}
}
