import { error, ok } from '../../../shared/helpers';
import { mapGameToMyScoreEntry } from './mapper';
import {
	fetchCompletedTournamentGamesForUser,
	fetchUserRatingSnapshot,
} from './queries';
import type { MyScoreResponse } from './types';
import type { MyScoreQuery } from './validation';

function isInRequestedRange(playedAtIso: string, range: MyScoreQuery['range'], now: Date): boolean {
	if (range === 'allTime') {
		return true;
	}

	const playedAt = new Date(playedAtIso);
	if (!Number.isFinite(playedAt.getTime())) {
		return false;
	}

	const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	return playedAt >= cutoff;
}

function matchesMode(mode: MyScoreQuery['mode'], matchMode: 'singles' | 'doubles'): boolean {
	if (mode === 'all') {
		return true;
	}

	return mode === matchMode;
}

export async function getMyScoreFlow(userId: string, query: MyScoreQuery) {
	const [games, ratingSnapshot] = await Promise.all([
		fetchCompletedTournamentGamesForUser(userId),
		fetchUserRatingSnapshot(userId),
	]);

	if (!ratingSnapshot) {
		return error(404, 'User not found');
	}

	const now = new Date();
	const mappedEntries = games
		.map((game) => mapGameToMyScoreEntry(game, userId))
		.filter((entry): entry is NonNullable<typeof entry> => entry != null)
		.filter((entry) => matchesMode(query.mode, entry.mode))
		.filter((entry) => isInRequestedRange(entry.playedAt, query.range, now))
		.sort((left, right) => {
			if (left.playedAt !== right.playedAt) {
				return right.playedAt.localeCompare(left.playedAt);
			}
			return left.id.localeCompare(right.id);
		});

	const totalWins = mappedEntries.filter((entry) => entry.didWin === true).length;

	const response: MyScoreResponse = {
		summary: {
			totalMatches: mappedEntries.length,
			totalWins,
			glicko2: {
				rating: Math.round(ratingSnapshot.rating),
				rd: Math.round(ratingSnapshot.rd),
			},
		},
		filters: {
			mode: query.mode,
			range: query.range,
		},
		entries: mappedEntries,
	};

	return ok(response, { status: 200, message: 'My score fetched successfully' });
}
