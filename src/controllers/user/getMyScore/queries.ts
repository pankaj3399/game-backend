import { Types } from 'mongoose';
import Game from '../../../models/Game';
import User from '../../../models/User';
import { determineDidWinFromSetScores } from './mapper';
import type { MyScoreQuery } from './validation';

export interface PopulatedPlayer {
	_id: Types.ObjectId;
	name?: string | null;
	alias?: string | null;
}

interface PopulatedTournament {
	_id: Types.ObjectId;
	name?: string | null;
}

interface PopulatedTeam {
	players: (PopulatedPlayer | Types.ObjectId)[];
}

export interface MyScoreGameDoc {
	_id: Types.ObjectId;
	side1: PopulatedTeam;
	side2: PopulatedTeam;
	tournament: PopulatedTournament | Types.ObjectId | null;
	score?: {
		playerOneScores?: unknown[];
		playerTwoScores?: unknown[];
	} | null;
	matchType?: 'singles' | 'doubles' | null;
	playMode?: string | null;
	startTime?: Date | null;
	endTime?: Date | null;
	createdAt?: Date | null;
}

interface UserRatingSnapshot {
	rating: number;
	rd: number;
}

export interface FetchCompletedTournamentGamesOptions {
	userId: string;
	mode: MyScoreQuery['mode'];
	range: MyScoreQuery['range'];
	page: number;
	limit: number;
	now?: Date;
}

export interface FetchCompletedTournamentGamesResult {
	entries: MyScoreGameDoc[];
	totalEntries: number;
	totalWins: number;
}

const RANGE_DAYS = 30;
// Hard cap on docs scanned for the totals/wins aggregate to keep work bounded
// even for users with very long histories. Pagination handles the page itself.
const TOTALS_SCAN_CAP = 1000;

interface LightweightGameDoc {
	side1?: { players?: Types.ObjectId[] | null } | null;
	side2?: { players?: Types.ObjectId[] | null } | null;
	score?: {
		playerOneScores?: unknown[];
		playerTwoScores?: unknown[];
	} | null;
}

function buildBaseFilter(
	userObjectId: Types.ObjectId,
	options: FetchCompletedTournamentGamesOptions
): Record<string, unknown> {
	const userInSide = {
		$or: [{ 'side1.players': userObjectId }, { 'side2.players': userObjectId }],
	};

	const filter: Record<string, unknown> = {
		gameMode: 'tournament',
		status: 'finished',
	};

	if (options.mode === 'singles' || options.mode === 'doubles') {
		filter.matchType = options.mode;
	}

	if (options.range === 'last30Days') {
		const now = options.now ?? new Date();
		const cutoff = new Date(now.getTime() - RANGE_DAYS * 24 * 60 * 60 * 1000);
		// Mirrors mapper.resolvePlayedAt fallback (endTime → startTime → createdAt):
		// a doc qualifies if any of those dates falls within the cutoff window.
		filter.$and = [
			userInSide,
			{
				$or: [
					{ endTime: { $gte: cutoff } },
					{ startTime: { $gte: cutoff } },
					{ createdAt: { $gte: cutoff } },
				],
			},
		];
	} else {
		Object.assign(filter, userInSide);
	}

	return filter;
}

export async function fetchCompletedTournamentGamesForUser(
	options: FetchCompletedTournamentGamesOptions
): Promise<FetchCompletedTournamentGamesResult> {
	if (!Types.ObjectId.isValid(options.userId)) {
		return { entries: [], totalEntries: 0, totalWins: 0 };
	}

	const userObjectId = new Types.ObjectId(options.userId);
	const filter = buildBaseFilter(userObjectId, options);
	const skip = Math.max(0, (options.page - 1) * options.limit);
	const sort = { endTime: -1, startTime: -1, createdAt: -1, _id: -1 } as const;

	const [entries, totalEntries, totalWins] = await Promise.all([
		Game.find(filter)
			.select('_id side1 side2 tournament score matchType playMode startTime endTime createdAt')
			.populate('side1.players', 'name alias')
			.populate('side2.players', 'name alias')
			.populate('tournament', 'name')
			.sort(sort)
			.skip(skip)
			.limit(options.limit)
			.lean<MyScoreGameDoc[]>()
			.exec(),
		Game.countDocuments(filter).exec(),
		countTournamentWinsForUser(userObjectId, filter),
	]);

	return { entries, totalEntries, totalWins };
}

async function countTournamentWinsForUser(
	userObjectId: Types.ObjectId,
	filter: Record<string, unknown>
): Promise<number> {
	const userIdStr = userObjectId.toString();

	const lightweight = await Game.find(filter)
		.select('side1.players side2.players score')
		.sort({ endTime: -1, startTime: -1, createdAt: -1, _id: -1 })
		.limit(TOTALS_SCAN_CAP)
		.lean<LightweightGameDoc[]>()
		.exec();

	let wins = 0;
	for (const game of lightweight) {
		const side1Players = Array.isArray(game.side1?.players) ? game.side1!.players! : [];
		const side2Players = Array.isArray(game.side2?.players) ? game.side2!.players! : [];

		const userInSide1 = side1Players.some((id) => id?.toString?.() === userIdStr);
		const userInSide2 = side2Players.some((id) => id?.toString?.() === userIdStr);
		if (!userInSide1 && !userInSide2) {
			continue;
		}

		const mySetScores = userInSide1 ? game.score?.playerOneScores : game.score?.playerTwoScores;
		const oppSetScores = userInSide1 ? game.score?.playerTwoScores : game.score?.playerOneScores;

		if (determineDidWinFromSetScores(mySetScores, oppSetScores) === true) {
			wins += 1;
		}
	}

	return wins;
}

export async function fetchUserRatingSnapshot(userId: string): Promise<UserRatingSnapshot | null> {
	const user = await User.findById(userId)
		.select('elo.rating elo.rd')
		.lean<{ elo?: { rating?: number | null; rd?: number | null } }>()
		.exec();

	if (!user) {
		return null;
	}

	const rating = typeof user.elo?.rating === 'number' ? user.elo.rating : 1500;
	const rd = typeof user.elo?.rd === 'number' ? user.elo.rd : 200;

	return {
		rating,
		rd,
	};
}
