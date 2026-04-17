import { Types } from 'mongoose';
import type { MyScoreEntry, MyScoreMatchMode } from './types';
import type { MyScoreGameDoc } from './queries';

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

type MyScorePlayer = MyScoreGameDoc['teams'][number]['players'][number] | null | undefined;

function toPlayerId(player: MyScorePlayer): string | null {
	if (!player) {
		return null;
	}

	if (player instanceof Types.ObjectId) {
		return player.toString();
	}

	return player._id.toString();
}

function resolveName(player: MyScorePlayer, fallback: string): string {
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

function getTeamIds(players: MyScorePlayer[]): string[] {
	const ids: string[] = [];
	for (const player of players) {
		const id = toPlayerId(player);
		if (id) {
			ids.push(id);
		}
	}
	return ids;
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

function resolveMatchModeFromType(
	matchType: string | null | undefined,
	playMode: string | null | undefined
): MyScoreMatchMode {
	if (matchType === 'doubles') {
		return 'doubles';
	}

	if (matchType === 'singles') {
		return 'singles';
	}

	return resolveMatchMode(playMode);
}

function resolveTeamName(players: MyScorePlayer[], isDoubles: boolean, fallback: string): string {
	if (!isDoubles) {
		return resolveName(players[0], fallback);
	}

	const names = players
		.slice(0, 2)
		.map((player, index) => resolveName(player, `${fallback} ${index + 1}`))
		.filter((name) => name.trim().length > 0);

	if (names.length === 0) {
		return fallback;
	}

	if (names.length === 1) {
		return names[0];
	}

	if (names[0] === names[1]) {
		return names[0];
	}

	return `${names[0]} & ${names[1]}`;
}

export function mapGameToMyScoreEntry(game: MyScoreGameDoc, userId: string): MyScoreEntry | null {
	if (!Array.isArray(game.teams) || game.teams.length < 2) {
		return null;
	}

	const isDoubles = game.matchType === 'doubles';
	const teamOnePlayers = Array.isArray(game.teams[0]?.players) ? game.teams[0].players : [];
	const teamTwoPlayers = Array.isArray(game.teams[1]?.players) ? game.teams[1].players : [];
	if (teamOnePlayers.length === 0 || teamTwoPlayers.length === 0) {
		return null;
	}

	const teamOneIds = getTeamIds(teamOnePlayers);
	const teamTwoIds = getTeamIds(teamTwoPlayers);
	if (teamOneIds.length === 0 || teamTwoIds.length === 0) {
		return null;
	}

	const userInTeamOne = teamOneIds.includes(userId);
	const userInTeamTwo = teamTwoIds.includes(userId);

	if (!userInTeamOne && !userInTeamTwo) {
		return null;
	}

	const opponentName = userInTeamOne
		? resolveTeamName(teamTwoPlayers, isDoubles, 'Unknown opponent')
		: resolveTeamName(teamOnePlayers, isDoubles, 'Unknown opponent');

	const opponentId = userInTeamOne
		? isDoubles
			? teamTwoIds.join(':')
			: teamTwoIds[0]
		: isDoubles
			? teamOneIds.join(':')
			: teamOneIds[0];

	const playerOneScores = toScoreBreakdown(game.score?.playerOneScores);
	const playerTwoScores = toScoreBreakdown(game.score?.playerTwoScores);
	const myScore = userInTeamOne ? playerOneScores : playerTwoScores;
	const opponentScore = userInTeamOne ? playerTwoScores : playerOneScores;

	return {
		id: game._id.toString(),
		playedAt: resolvePlayedAt(game).toISOString(),
		tournament: {
			id: toIdString(game.tournament),
			name: resolveTournamentName(game),
		},
		opponent: {
			id: opponentId ?? '',
			name: opponentName,
		},
		mode: resolveMatchModeFromType(game.matchType, game.playMode),
		myScore: myScore.total,
		opponentScore: opponentScore.total,
		didWin: resolveDidWin(myScore, opponentScore),
	};
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
