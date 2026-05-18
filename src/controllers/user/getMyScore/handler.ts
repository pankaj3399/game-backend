import { Types } from 'mongoose';
import { logger } from '../../../lib/logger';
import { error, ok } from '../../../shared/helpers';
import { mapGameToMyScoreEntry } from './mapper';
import {
	buildStandaloneMyScoreListFilter,
	countStandaloneWinsForUser,
	fetchCompletedTournamentGamesForUser,
	fetchStandaloneGamesForUser,
	fetchUserRatingSnapshot,
	MAX_STANDALONE_GAMES_FETCH,
} from './queries';
import type { MyScoreEntry, MyScoreResponse } from './types';
import type { MyScoreQuery } from './validation';

export async function getMyScoreFlow(userId: string, query: MyScoreQuery) {
	const now = new Date();
	const requestedDepth = query.page * query.limit;

	if (requestedDepth > MAX_STANDALONE_GAMES_FETCH) {
		return error(
			422,
			`Requested page depth exceeds the ${MAX_STANDALONE_GAMES_FETCH}-row limit supported by page/limit merging across fetchCompletedTournamentGamesForUser and fetchStandaloneGamesForUser. Use cursor pagination for deeper score history.`
		);
	}

	const mergedSourceLimit = Math.min(requestedDepth + 50, MAX_STANDALONE_GAMES_FETCH);

	const userObjectId = new Types.ObjectId(userId);
	const standaloneListFilter = buildStandaloneMyScoreListFilter(userObjectId, {
		mode: query.mode,
		range: query.range,
		now,
	});

	const [gamesPage, standalonePage, standaloneWinsAgg, ratingSnapshot] = await Promise.all([
		fetchCompletedTournamentGamesForUser({
			userId,
			mode: query.mode,
			range: query.range,
			page: 1,
			// Fetch a generous slice to allow merging with standalone entries before re-paginating.
			limit: mergedSourceLimit,
			now,
		}),
		fetchStandaloneGamesForUser({
			userId,
			mode: query.mode,
			range: query.range,
			limit: mergedSourceLimit,
			now,
		}),
		countStandaloneWinsForUser(userObjectId, standaloneListFilter, now),
		fetchUserRatingSnapshot(userId),
	]);

	if (!ratingSnapshot) {
		return error(404, 'User not found');
	}

	// Map standalone / independent QR matches (Glicko still reflects tournament play only).
	const standaloneEntries: MyScoreEntry[] = [];
	for (const game of standalonePage.entries) {
		const entry = mapGameToMyScoreEntry(game, userId, game.status);
		if (!entry) {
			logger.error('getMyScore: unmappable standalone game after list filter', {
				gameId: game._id.toString(),
				userId,
			});
			return error(500, 'Unable to load score history');
		}
		standaloneEntries.push(entry);
	}

	// Map tournament games.
	const tournamentEntries: MyScoreEntry[] = [];
	for (const game of gamesPage.entries) {
		const entry = mapGameToMyScoreEntry(game, userId, 'finished');
		if (!entry) {
			logger.error('getMyScore: unmappable game after list filter', {
				gameId: game._id.toString(),
				userId,
			});
			return error(500, 'Unable to load score history');
		}
		tournamentEntries.push(entry);
	}

	// Merge and sort by playedAt descending, then paginate on the materialized merged list.
	const mergedEntries = [...standaloneEntries, ...tournamentEntries].sort(
		(a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
	);

	const totalEntries = gamesPage.totalEntries + standalonePage.totalEntries;
	const totalPages = Math.max(1, Math.ceil(totalEntries / query.limit));
	const page = Math.min(Math.max(1, query.page), totalPages);
	const skip = (page - 1) * query.limit;
	const pagedEntries = mergedEntries.slice(skip, skip + query.limit);

	const response: MyScoreResponse = {
		player: {
			id: userId,
			displayName: ratingSnapshot.displayName,
		},
		summary: {
			totalMatches: gamesPage.totalEntries + standalonePage.totalEntries,
			totalWins: gamesPage.estimatedWins + standaloneWinsAgg.estimatedWins,
			winsTruncated: gamesPage.winsTruncated || standaloneWinsAgg.winsTruncated,
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
		entries: pagedEntries,
	};

	return ok(response, { status: 200, message: 'My score fetched successfully' });
}
