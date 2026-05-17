import { Types } from 'mongoose';
import Game from '../../../models/Game';
import ScoreValidationRequest from '../../../models/ScoreValidationRequest';
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
	playedAt?: Date | null;
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

/** Upper bound for standalone rows loaded per request (aligned with merged tournament window). */
export const MAX_STANDALONE_GAMES_FETCH = 500;

export interface FetchStandaloneGamesOptions {
	userId: string;
	mode: MyScoreQuery['mode'];
	range: MyScoreQuery['range'];
	now?: Date;
	/** Caps standalone history reads; defaults to {@link MAX_STANDALONE_GAMES_FETCH}. */
	limit?: number;
}

export interface StandaloneGameDoc extends MyScoreGameDoc {
	status: 'pendingScore' | 'finished';
}

export interface FetchStandaloneGamesResult {
	entries: StandaloneGameDoc[];
	totalEntries: number;
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
		filter.$and = [userInSide, { playedAt: { $gte: cutoff } }];
	} else {
		Object.assign(filter, userInSide);
	}

	return filter;
}

/** Aligns list/count queries with rows mapGameToMyScoreEntry returns (non-null). */
function withMappableGameShapeConstraints(filter: Record<string, unknown>): Record<string, unknown> {
	const shapeConstraints: Record<string, unknown>[] = [
		{ side1: { $exists: true, $ne: null } },
		{ side2: { $exists: true, $ne: null } },
		{ 'side1.players': { $elemMatch: { $ne: null } } },
		{ 'side2.players': { $elemMatch: { $ne: null } } },
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

/**
 * Standalone rows may legitimately have an empty opponent side while waiting for
 * confirmation, so only require the shape needed for mapGameToMyScoreEntry.
 */
function withStandaloneMappableGameShapeConstraints(
	filter: Record<string, unknown>
): Record<string, unknown> {
	const shapeConstraints: Record<string, unknown>[] = [
		{ side1: { $exists: true, $ne: null } },
		{ side2: { $exists: true, $ne: null } },
	];

	const modeIsSinglesOrDoubles =
		filter.matchType === 'singles' || filter.matchType === 'doubles';

	if (!modeIsSinglesOrDoubles) {
		shapeConstraints.push({ matchType: { $in: ['singles', 'doubles'] } });
	}

	// At least one side has a player (opponent side may be empty while QR is pending).
	shapeConstraints.push({
		$or: [
			{ 'side1.players': { $elemMatch: { $ne: null } } },
			{ 'side2.players': { $elemMatch: { $ne: null } } },
		],
	});

	const existingAnd = filter.$and;
	if (Array.isArray(existingAnd)) {
		return { ...filter, $and: [...existingAnd, ...shapeConstraints] };
	}

	return {
		...filter,
		$and: shapeConstraints,
	};
}

export function buildStandaloneMyScoreListFilter(
	userObjectId: Types.ObjectId,
	options: Pick<FetchStandaloneGamesOptions, 'mode' | 'range' | 'now'>,
): Record<string, unknown> {
	const userInSide = {
		$or: [{ 'side1.players': userObjectId }, { 'side2.players': userObjectId }],
	};

	const filter: Record<string, unknown> = {
		gameMode: 'standalone',
		status: { $in: ['pendingScore', 'finished'] },
	};

	if (options.mode === 'singles' || options.mode === 'doubles') {
		filter.matchType = options.mode;
	}

	if (options.range === 'last30Days') {
		const now = options.now ?? new Date();
		const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		filter.$and = [userInSide, { playedAt: { $gte: cutoff } }];
	} else {
		Object.assign(filter, userInSide);
	}

	return withStandaloneMappableGameShapeConstraints(filter);
}

/**
 * Standalone rows with no opponent on the roster are only meaningful while an
 * independent score-QR request is still pending and unexpired. Otherwise they
 * are abandoned drafts and must not appear in My Score.
 */
function standaloneMyScoreQrVisibilityStages(now: Date) {
	const requestCollection = ScoreValidationRequest.collection.name;
	return [
		{
			$lookup: {
				from: requestCollection,
				let: { gameId: '$_id' },
				pipeline: [
					{
						$match: {
							$expr: { $eq: ['$match', '$$gameId'] },
							tournament: null,
							status: 'pending',
							expiresAt: { $gt: now },
						},
					},
					{ $limit: 1 },
				],
				as: 'activeIndependentQr',
			},
		},
		{
			$match: {
				$or: [
					{ status: 'finished' },
					{
						$and: [
							{ $expr: { $gt: [{ $size: { $ifNull: ['$side1.players', []] } }, 0] } },
							{ $expr: { $gt: [{ $size: { $ifNull: ['$side2.players', []] } }, 0] } },
						],
					},
					{ 'activeIndependentQr.0': { $exists: true } },
				],
			},
		},
	];
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

	const totalEntries = await Game.countDocuments(listFilter).exec();
	const limit = Math.max(1, options.limit);
	const totalPages = Math.max(1, Math.ceil(totalEntries / limit));
	const page = Math.min(Math.max(1, options.page), totalPages);
	const skip = Math.max(0, (page - 1) * limit);

	const [entries, winsAggregate] = await Promise.all([
		(async (): Promise<MyScoreGameDoc[]> => {
			const idRows = await Game.aggregate<{ _id: Types.ObjectId }>([
				{ $match: listFilter },
				{ $sort: { playedAt: -1, _id: -1 } },
				{ $skip: skip },
				{ $limit: limit },
				{ $project: { _id: 1 } },
			]).exec();

			const orderedIds = idRows.map((row) => row._id);
			if (orderedIds.length === 0) {
				return [];
			}

			const raw = await Game.find({ _id: { $in: orderedIds } })
				.select('_id side1 side2 tournament score matchType playMode startTime endTime createdAt playedAt')
				.populate('side1.players', 'name alias')
				.populate('side2.players', 'name alias')
				.populate('tournament', 'name')
				.lean<MyScoreGameDoc[]>()
				.exec();

			const byId = new Map(raw.map((doc) => [doc._id.toString(), doc]));
			return orderedIds.map((id) => byId.get(id.toString())).filter((doc): doc is MyScoreGameDoc => doc != null);
		})(),
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

	const lightweight = await Game.aggregate<LightweightGameDoc>([
		{ $match: filter },
		{ $sort: { playedAt: -1, _id: -1 } },
		{ $limit: TOTALS_SCAN_CAP + 1 },
		{ $project: { side1: 1, side2: 1, score: 1 } },
	]).exec();

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

export async function countStandaloneWinsForUser(
	userObjectId: Types.ObjectId,
	listFilter: Record<string, unknown>,
): Promise<{ estimatedWins: number; winsTruncated: boolean }> {
	const userIdStr = userObjectId.toString();
	const finishedFilter = { ...listFilter, status: 'finished' };

	const lightweight = await Game.aggregate<LightweightGameDoc>([
		{ $match: finishedFilter },
		{ $sort: { playedAt: -1, _id: -1 } },
		{ $limit: TOTALS_SCAN_CAP + 1 },
		{ $project: { side1: 1, side2: 1, score: 1 } },
	]).exec();

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

export async function fetchStandaloneGamesForUser(
	options: FetchStandaloneGamesOptions,
): Promise<FetchStandaloneGamesResult> {
	if (!Types.ObjectId.isValid(options.userId)) {
		return {
			entries: [],
			totalEntries: 0,
		};
	}

	const userObjectId = new Types.ObjectId(options.userId);
	const listFilter = buildStandaloneMyScoreListFilter(userObjectId, options);
	const now = options.now ?? new Date();
	const cap = Math.min(options.limit ?? MAX_STANDALONE_GAMES_FETCH, MAX_STANDALONE_GAMES_FETCH);

	const visibilityStages = standaloneMyScoreQrVisibilityStages(now);

	const [facetRow] = await Game.aggregate<{
		ids: { _id: Types.ObjectId }[];
		totalCount: { n: number }[];
	}>([
		{ $match: listFilter },
		...visibilityStages,
		{
			$facet: {
				ids: [
					{ $sort: { playedAt: -1, _id: -1 } },
					{ $limit: cap },
					{ $project: { _id: 1 } },
				],
				totalCount: [{ $count: 'n' }],
			},
		},
	]).exec();

	const rawCount = facetRow?.totalCount?.[0]?.n ?? 0;
	const totalEntries = Math.min(rawCount, MAX_STANDALONE_GAMES_FETCH);
	const idRows = facetRow?.ids ?? [];

	const orderedIds = idRows.map((row) => row._id);
	if (orderedIds.length === 0) {
		return {
			entries: [],
			totalEntries,
		};
	}

	const raw = await Game.find({ _id: { $in: orderedIds } })
		.select('_id side1 side2 tournament score matchType playMode startTime endTime createdAt playedAt status')
		.populate('side1.players', 'name alias')
		.populate('side2.players', 'name alias')
		.lean<(MyScoreGameDoc & { status: string })[]>()
		.exec();

	const byId = new Map(raw.map((doc) => [doc._id.toString(), doc]));
	const ordered = orderedIds
		.map((id) => byId.get(id.toString()))
		.filter((doc): doc is MyScoreGameDoc & { status: string } => doc != null);

	return {
		entries: ordered.filter(
			(doc): doc is StandaloneGameDoc =>
				doc.status === 'pendingScore' || doc.status === 'finished',
		),
		totalEntries,
	};
}
