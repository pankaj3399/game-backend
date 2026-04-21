import { Types } from 'mongoose';
import { logger } from '../../../lib/logger';
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

type MyScorePlayer = MyScoreGameDoc['side1']['players'][number] | null | undefined;

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

function resolvePlayedAt(game: MyScoreGameDoc): Date {
	for (const value of [game.endTime, game.startTime, game.createdAt]) {
		if (value instanceof Date && Number.isFinite(value.getTime())) {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = new Date(value);
			if (Number.isFinite(parsed.getTime())) {
				return parsed;
			}
		}
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

function compareSetScore(left: unknown, right: unknown): number {
  if (isWalkover(left) && isWalkover(right)) {
    return 0;
  }
  if (isWalkover(left)) {
    return -1;
  }
  if (isWalkover(right)) {
    return 1;
  }
  if (typeof left !== "number" || !Number.isFinite(left)) {
    logger.debug("compareSetScore: non-finite score", {
      function: "compareSetScore",
      side: "left",
      value: left,
    });
    return 0;
  }
  if (typeof right !== "number" || !Number.isFinite(right)) {
    logger.debug("compareSetScore: non-finite score", {
      function: "compareSetScore",
      side: "right",
      value: right,
    });
    return 0;
  }
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
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
	if (!game.side1 || !game.side2) {
		return null;
	}

	const resolvedMode = resolveMatchModeFromType(game.matchType, game.playMode);
	const isDoubles = resolvedMode === 'doubles';
	const teamOnePlayers = Array.isArray(game.side1?.players) ? game.side1.players : [];
	const teamTwoPlayers = Array.isArray(game.side2?.players) ? game.side2.players : [];
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
	const mySetScores = userInTeamOne ? game.score?.playerOneScores : game.score?.playerTwoScores;
	const oppSetScores = userInTeamOne ? game.score?.playerTwoScores : game.score?.playerOneScores;

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
		mode: resolvedMode,
		myScore: myScore.total,
		opponentScore: opponentScore.total,
		didWin: resolveDidWin(myScore, opponentScore, mySetScores, oppSetScores),
	};
}

function resolveDidWin(
  myScore: ScoreBreakdown,
  opponentScore: ScoreBreakdown,
  mySetScores: unknown[] | undefined,
  opponentSetScores: unknown[] | undefined
): boolean | null {
	if (myScore.hasWalkover && !opponentScore.hasWalkover) {
		return false;
	}

	if (!myScore.hasWalkover && opponentScore.hasWalkover) {
		return true;
	}

  if (Array.isArray(mySetScores) && Array.isArray(opponentSetScores)) {
    if (mySetScores.length !== opponentSetScores.length) {
      return null;
    }
    const length = Math.min(mySetScores.length, opponentSetScores.length);
    let mySetWins = 0;
    let opponentSetWins = 0;
    for (let index = 0; index < length; index += 1) {
      const result = compareSetScore(mySetScores[index], opponentSetScores[index]);
      if (result > 0) {
        mySetWins += 1;
      } else if (result < 0) {
        opponentSetWins += 1;
      }
    }
    if (mySetWins !== opponentSetWins) {
      return mySetWins > opponentSetWins;
    }
    return null;
  }

	if (myScore.total == null || opponentScore.total == null) {
		return null;
	}

	if (myScore.total === opponentScore.total) {
		return null;
	}

	return myScore.total > opponentScore.total;
}
