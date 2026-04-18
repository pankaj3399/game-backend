import { Types } from 'mongoose';
import type { MyScoreEntry, MyScoreMatchMode } from './types';
import type { MyScoreGameDoc, PopulatedPlayer } from './queries';

interface ScoreBreakdown {
	total: number | null;
	hasWalkover: boolean;
}

function toIdString(value: Types.ObjectId | { _id: Types.ObjectId } | null | undefined): string | null {
	if (!value) {
		return null;
	}

	if (value instanceof Types.ObjectId) {
		return value.toString();
	}

	return value._id.toString();
}

function resolveName(player: PopulatedPlayer | Types.ObjectId | null | undefined, fallback: string): string {
	if (!player || player instanceof Types.ObjectId) {
		return fallback;
	}

	const alias = player.alias?.trim();
	if (alias) {
		return alias;
	}

	const name = player.name?.trim();
	if (name) {
		return name;
	}

	return fallback;
}

function resolveTournamentName(game: MyScoreGameDoc): string {
	if (game.tournament && !(game.tournament instanceof Types.ObjectId)) {
		const tournamentName = game.tournament.name?.trim();
		if (tournamentName) {
			return tournamentName;
		}
	}

	return 'Tournament match';
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date && Number.isFinite(value.getTime())) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = new Date(value);
		if (Number.isFinite(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
}

function resolvePlayedAt(game: MyScoreGameDoc): Date {
	const preferredDate = toDate(game.endTime) ?? toDate(game.startTime) ?? toDate(game.createdAt);
	if (preferredDate) {
		return preferredDate;
	}

	return new Date(0);
}

function isWalkover(value: unknown): value is 'wo' {
	return typeof value === 'string' && value.toLowerCase() === 'wo';
}

function toScoreBreakdown(scoreValues: unknown[] | undefined): ScoreBreakdown {
	if (!Array.isArray(scoreValues)) {
		return {
			total: null,
			hasWalkover: false,
		};
	}

	let hasNumeric = false;
	let total = 0;
	let hasWalkover = false;

	for (const score of scoreValues) {
		if (typeof score === 'number' && Number.isFinite(score)) {
			hasNumeric = true;
			total += score;
			continue;
		}

		if (isWalkover(score)) {
			hasWalkover = true;
		}
	}

	return {
		total: hasNumeric ? total : null,
		hasWalkover,
	};
}

function resolveMatchMode(playMode: string | null | undefined): MyScoreMatchMode {
	const mode = playMode?.trim().toLowerCase() ?? '';
	if (mode.includes('double')) {
		return 'doubles';
	}

	return 'singles';
}

function resolveDidWin(myScore: ScoreBreakdown, opponentScore: ScoreBreakdown): boolean | null {
	if (myScore.hasWalkover && !opponentScore.hasWalkover) {
		return false;
	}

	if (!myScore.hasWalkover && opponentScore.hasWalkover) {
		return true;
	}

	if (myScore.total == null || opponentScore.total == null) {
		return null;
	}

	if (myScore.total === opponentScore.total) {
		return null;
	}

	return myScore.total > opponentScore.total;
}

export function mapGameToMyScoreEntry(game: MyScoreGameDoc, userId: string): MyScoreEntry | null {
	const teams = game.teams;
	if (!teams || teams.length !== 2) {
		return null;
	}

	let userTeamIndex: 0 | 1 | null = null;
	for (let i = 0; i < 2; i += 1) {
		const teamPlayers = teams[i]?.players;
		if (!Array.isArray(teamPlayers)) {
			continue;
		}
		for (const p of teamPlayers) {
			const pid = toIdString(p as PopulatedPlayer | Types.ObjectId);
			if (pid === userId) {
				userTeamIndex = i as 0 | 1;
				break;
			}
		}
		if (userTeamIndex !== null) {
			break;
		}
	}

	if (userTeamIndex === null) {
		return null;
	}

	const userIsPlayerOne = userTeamIndex === 0;
	const opponentTeam = teams[1 - userTeamIndex];
	const opponentPlayers = opponentTeam?.players;
	if (!Array.isArray(opponentPlayers) || opponentPlayers.length === 0) {
		return null;
	}

	const firstOpponent = opponentPlayers[0];
	const opponentId = toIdString(firstOpponent as PopulatedPlayer | Types.ObjectId);
	if (!opponentId) {
		return null;
	}

	const opponentName =
		opponentPlayers.length === 1
			? resolveName(firstOpponent as PopulatedPlayer | Types.ObjectId, 'Unknown opponent')
			: opponentPlayers
					.map((p) => resolveName(p as PopulatedPlayer | Types.ObjectId, 'Unknown'))
					.join(' / ');

	const playerOneScores = toScoreBreakdown(game.score?.playerOneScores);
	const playerTwoScores = toScoreBreakdown(game.score?.playerTwoScores);
	const myScore = userIsPlayerOne ? playerOneScores : playerTwoScores;
	const opponentScore = userIsPlayerOne ? playerTwoScores : playerOneScores;

	return {
		id: game._id.toString(),
		playedAt: resolvePlayedAt(game).toISOString(),
		tournament: {
			id: toIdString(game.tournament),
			name: resolveTournamentName(game),
		},
		opponent: {
			id: opponentId,
			name: opponentName,
		},
		mode: resolveMatchMode(game.playMode),
		myScore: myScore.total,
		opponentScore: opponentScore.total,
		didWin: resolveDidWin(myScore, opponentScore),
	};
}
