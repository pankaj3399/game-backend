import { logger } from '../../../lib/logger';
import { error, ok } from '../../../shared/helpers';
import { mapGameToMyScoreEntry } from './mapper';
import {
	fetchCompletedTournamentGamesForUser,
	fetchUserRatingSnapshot,
} from './queries';
import type { MyScoreEntry, MyScoreResponse } from './types';
import type { MyScoreQuery } from './validation';

export async function getMyScoreFlow(userId: string, query: MyScoreQuery) {
	const now = new Date();

	const [gamesPage, ratingSnapshot] = await Promise.all([
		fetchCompletedTournamentGamesForUser({
			userId,
			mode: query.mode,
			range: query.range,
			page: query.page,
			limit: query.limit,
			now,
		}),
		fetchUserRatingSnapshot(userId),
	]);

	if (!ratingSnapshot) {
		return error(404, 'User not found');
	}

	const {
		entries: rawEntries,
		totalEntries,
		estimatedWins,
		winsTruncated,
		page,
	} = gamesPage;

	const mappedEntries: MyScoreEntry[] = [];
	for (const game of rawEntries) {
		const entry = mapGameToMyScoreEntry(game, userId);
		if (!entry) {
			logger.error('getMyScore: unmappable game after list filter', {
				gameId: game._id.toString(),
				userId,
			});
			return error(500, 'Unable to load score history');
		}
		mappedEntries.push(entry);
	}

	const totalPages = Math.max(1, Math.ceil(totalEntries / query.limit));

	const response: MyScoreResponse = {
		summary: {
			totalMatches: totalEntries,
			totalWins: estimatedWins,
			winsTruncated,
			glicko2: {
				rating: Math.round(ratingSnapshot.rating),
				rd: Math.round(ratingSnapshot.rd),
			},
		},
		filters: {
			mode: query.mode,
			range: query.range,
		},
		pagination: {
			page,
			limit: query.limit,
			total: totalEntries,
			totalPages,
		},
		entries: mappedEntries,
	};

	return ok(response, { status: 200, message: 'My score fetched successfully' });
}
