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
	estimatedWins: number;
	winsTruncated: boolean;
	page: number;
}

const RANGE_DAYS = 30;
// Hard cap on docs scanned for estimatedWins to keep work bounded even for users
// with very long histories. winsTruncated is set when additional rows likely exist.
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

/** Aligns list/count queries with rows mapGameToMyScoreEntry returns (non-null). */
function withMappableGameShapeConstraints(filter: Record<string, unknown>): Record<string, unknown> {
	const shapeConstraints: Record<string, unknown>[] = [
		{ 'side1.players.0': { $exists: true } },
		{ 'side2.players.0': { $exists: true } },
	];

	const modeIsSinglesOrDoubles =
		filter.matchType === 'singles' || filter.matchType === 'doubles';

	if (!modeIsSinglesOrDoubles) {
		shapeConstraints.push({ matchType: { $in: ['singles', 'doubles'] } });
	}

	const existingAnd = filter.$and;
	if (Array.isArray(existingAnd)) {
		return { ...filter, $and: [...existingAnd, ...shapeConstraints] };
	}

	return {
		...filter,
		$and: shapeConstraints,
	};
}

export async function fetchCompletedTournamentGamesForUser(
	options: FetchCompletedTournamentGamesOptions
): Promise<FetchCompletedTournamentGamesResult> {
	if (!Types.ObjectId.isValid(options.userId)) {
		return {
			entries: [],
			totalEntries: 0,
			estimatedWins: 0,
			winsTruncated: false,
			page: 1,
		};
	}

	const userObjectId = new Types.ObjectId(options.userId);
	const baseFilter = buildBaseFilter(userObjectId, options);
	const listFilter = withMappableGameShapeConstraints(baseFilter);
	const sort = { endTime: -1, startTime: -1, createdAt: -1, _id: -1 } as const;

	const totalEntries = await Game.countDocuments(listFilter).exec();
	const limit = Math.max(1, options.limit);
	const totalPages = Math.max(1, Math.ceil(totalEntries / limit));
	const page = Math.min(Math.max(1, options.page), totalPages);
	const skip = Math.max(0, (page - 1) * limit);

	const [entries, winsAggregate] = await Promise.all([
		Game.find(listFilter)
			.select('_id side1 side2 tournament score matchType playMode startTime endTime createdAt')
			.populate('side1.players', 'name alias')
			.populate('side2.players', 'name alias')
			.populate('tournament', 'name')
			.sort(sort)
			.skip(skip)
			.limit(limit)
			.lean<MyScoreGameDoc[]>()
			.exec(),
		countTournamentWinsForUser(userObjectId, listFilter),
	]);

	const { estimatedWins, winsTruncated } = winsAggregate;

	return { entries, totalEntries, estimatedWins, winsTruncated, page };
}

async function countTournamentWinsForUser(
	userObjectId: Types.ObjectId,
	filter: Record<string, unknown>
): Promise<{ estimatedWins: number; winsTruncated: boolean }> {
	const userIdStr = userObjectId.toString();

	const lightweight = await Game.find(filter)
		.select('side1.players side2.players score')
		.sort({ endTime: -1, startTime: -1, createdAt: -1, _id: -1 })
		.limit(TOTALS_SCAN_CAP + 1)
		.lean<LightweightGameDoc[]>()
		.exec();

	const winsTruncated = lightweight.length > TOTALS_SCAN_CAP;
	const gamesToScore = winsTruncated ? lightweight.slice(0, TOTALS_SCAN_CAP) : lightweight;

	let wins = 0;
	for (const game of gamesToScore) {
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

	return { estimatedWins: wins, winsTruncated };
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
