import { escapeRegex } from '../../../lib/validation';
import { error, ok } from '../../../shared/helpers';
import type { SearchClubsQuery } from './validation';
import { findActiveClubsByName } from './queries';
import { logger } from '../../../lib/logger';

export async function searchClubsFlow(query: SearchClubsQuery) {
	try {
		const q = query.q ?? '';

		if (!q) {
			return ok({ clubs: [] });
		}

		const clubs = await findActiveClubsByName(escapeRegex(q));

		return ok({
			clubs: clubs.map((club) => ({ id: club._id.toString(), name: club.name }))
		});
	}
	catch (err) {
	logger.error('Error searching clubs', { err });
	return error(500, 'Internal server error');
}
}
