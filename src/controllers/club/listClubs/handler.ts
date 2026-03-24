import type { ListClubsQuery } from './validation';
import { ok,error} from '../../../shared/helpers';
import { countActiveClubs, findActiveClubsPage } from './queries';
import { logger } from '../../../lib/logger';
export async function listClubsFlow(query: ListClubsQuery) {
	try{
		const { page, limit, q } = query;
		const skip = (page - 1) * limit;
	
		const [totalCount, clubs] = await Promise.all([
			countActiveClubs(q),
			findActiveClubsPage(skip, limit, q)
		]);
	
		const totalPages = Math.max(1, Math.ceil(totalCount / limit));
	
		return ok({
			clubs: clubs.map((club) => ({
				id: club._id.toString(),
				name: club.name,
				address: club.address,
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
