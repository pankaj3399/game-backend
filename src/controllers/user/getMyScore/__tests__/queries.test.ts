import { Types } from 'mongoose';
import {
	buildStandaloneMyScoreListFilter,
	MAX_STANDALONE_GAMES_FETCH,
	fetchCompletedTournamentGamesForUser,
} from '../queries';
import Game from '../../../../models/Game';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/User');
jest.mock('../../../../models/ScoreValidationRequest');

const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011');

describe('buildStandaloneMyScoreListFilter', () => {
	it('scopes to standalone games for the user', () => {
		const filter = buildStandaloneMyScoreListFilter(USER_ID, { mode: 'all', range: 'allTime' });
		expect(filter.gameMode).toBe('standalone');
		expect(filter.$or).toEqual([
			{ 'side1.players': USER_ID },
			{ 'side2.players': USER_ID },
		]);
		expect(filter.status).toEqual({ $in: ['pendingScore', 'finished'] });
	});

	it('adds last30Days playedAt cutoff', () => {
		const now = new Date('2026-01-31T12:00:00Z');
		const filter = buildStandaloneMyScoreListFilter(USER_ID, { mode: 'singles', range: 'last30Days', now });
		expect(filter.matchType).toBe('singles');
		const andClause = filter.$and as Array<Record<string, unknown>>;
		const playedAtClause = andClause.find((c) => 'playedAt' in c) as { playedAt: { $gte: Date } };
		expect(playedAtClause.playedAt.$gte.getTime()).toBe(
			now.getTime() - 30 * 24 * 60 * 60 * 1000,
		);
	});
});

describe('fetchCompletedTournamentGamesForUser', () => {
	it('returns empty result for invalid user id without querying', async () => {
		const result = await fetchCompletedTournamentGamesForUser({
			userId: 'not-valid',
			mode: 'all',
			range: 'allTime',
			page: 1,
			limit: 10,
		});
		expect(result.entries).toEqual([]);
		expect(result.totalEntries).toBe(0);
		expect(Game.find).not.toHaveBeenCalled();
	});
});

describe('MAX_STANDALONE_GAMES_FETCH', () => {
	it('documents the merged pagination cap used by the handler', () => {
		expect(MAX_STANDALONE_GAMES_FETCH).toBe(500);
	});
});
