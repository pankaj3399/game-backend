import type { GameStatus } from "../../../types/domain/game";
import type {
  GameForMatchesDoc,
  GameMatchPlayerSlot,
  MatchPlayerResponse,
  MatchScoreValueResponse,
  MatchStatusResponse,
  ScheduleForMatchesDoc,
  ScheduleRoundDoc,
  TournamentMatchResponse,
} from "./types";

function mapStatus(status: GameStatus): MatchStatusResponse {
  switch (status) {
    case "finished":
      return "completed";
    case "pendingScore":
      return "pendingScore";
    case "active":
      return "inProgress";
    case "cancelled":
      return "cancelled";
    case "draft":
    case "inactive":
    default:
      return "scheduled";
  }
}

function normalizeScores(values: Array<number | "wo"> | undefined) {
  if (values == null) {
    return [];
  }

  const out: MatchScoreValueResponse[] = [];
  for (const v of values) {
    if (v === "wo") {
      out.push("wo");
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push(v);
    }
  }
  return out;
}

function mapPlayer(player: GameMatchPlayerSlot) {
  if (player == null) {
    return null;
  }

  const rating =
    typeof player.elo?.rating === "number" && Number.isFinite(player.elo.rating)
      ? player.elo.rating
      : null;
  const rd =
    typeof player.elo?.rd === "number" && Number.isFinite(player.elo.rd)
      ? player.elo.rd
      : null;

  return {
    id: player._id.toString(),
    name: player.name ?? null,
    alias: player.alias ?? null,
    elo: {
      rating,
      rd,
    },
  };
}

function mapTeam(team: GameForMatchesDoc["side1"] | GameForMatchesDoc["side2"]) {
  if (!team?.players || !Array.isArray(team.players)) {
    return [];
  }

  const out: MatchPlayerResponse[] = [];
  for (const player of team.players) {
    const mapped = mapPlayer(player);
    if (mapped != null) {
      out.push(mapped);
    }
  }
  return out;
}

function mapGameToMatch(
  game: GameForMatchesDoc | undefined,
  entry: ScheduleRoundDoc
): TournamentMatchResponse | null {
  if (!game?.side1 || !game.side2) {
    return null;
  }

  const team1 = mapTeam(game.side1);
  const team2 = mapTeam(game.side2);
  if (team1.length === 0 || team2.length === 0) {
    return null;
  }

  const playerOne = team1[0];
  const playerTwo = team2[0];

  const players: [MatchPlayerResponse, MatchPlayerResponse] = [playerOne, playerTwo];
  const side1: [MatchPlayerResponse, MatchPlayerResponse | null] = [playerOne, team1[1] ?? null];
  const side2: [MatchPlayerResponse, MatchPlayerResponse | null] = [playerTwo, team2[1] ?? null];

  const base: TournamentMatchResponse = {
    id: game._id.toString(),
    round: Math.max(1, Math.trunc(entry.round)),
    slot: Math.max(1, Math.trunc(entry.slot)),
    mode: game.matchType,
    playMode: game.playMode,
    status: mapStatus(game.status),
    startTime: game.startTime?.toISOString() ?? null,
    score: {
      playerOneScores: normalizeScores(game.score?.playerOneScores),
      playerTwoScores: normalizeScores(game.score?.playerTwoScores),
    },
    court: {
      id: game.court?._id?.toString() ?? null,
      name: game.court?.name ?? null,
    },
    players,
    side1,
    side2,
  };

  // Include information about detached/historical games (regenerated/rolled back)
  if ((game as any).isHistorical === true) {
    (base as any).isHistorical = true;
    (base as any).detachedFromRound =
      typeof (game as any).detachedFromRound === "number"
        ? Math.trunc((game as any).detachedFromRound)
        : null;
    (base as any).detachedFromSlot =
      typeof (game as any).detachedFromSlot === "number"
        ? Math.trunc((game as any).detachedFromSlot)
        : null;
  }

  return base;
}

export function mapTournamentMatchesResponse(
  schedule: ScheduleForMatchesDoc | null,
  games: GameForMatchesDoc[],
  totalRoundsInput: number
) {
  const gamesById = new Map<string, GameForMatchesDoc>();
  for (const g of games) {
    gamesById.set(g._id.toString(), g);
  }

  const matches = [];
  for (const entry of schedule?.rounds ?? []) {
    const mapped = mapGameToMatch(gamesById.get(entry.game.toString()), entry);
    if (mapped != null) {
      matches.push(mapped);
    }
  }

  // Include detached/historical games that no longer exist in schedule.rounds
  // but were preserved during a regeneration. These games will have `isHistorical` and
  // `detachedFromRound`/`detachedFromSlot` set by the generator.
  for (const g of games) {
    if ((g as any).isHistorical !== true) continue;
    const id = g._id.toString();
    // Skip if already represented by schedule entries
    if (matches.some((m) => m.id === id)) continue;
    const syntheticEntry = {
      game: g._id,
      round: (g as any).detachedFromRound ?? 1,
      slot: (g as any).detachedFromSlot ?? 1,
    } as ScheduleRoundDoc;
    const mapped = mapGameToMatch(g, syntheticEntry);
    if (mapped != null) {
      // mark as historical is added inside mapGameToMatch
      matches.push(mapped);
    }
  }

  matches.sort((a, b) =>
    a.round !== b.round
      ? a.round - b.round
      : a.slot !== b.slot
        ? a.slot - b.slot
        : a.id.localeCompare(b.id)
  );

  const totalRounds = Math.max(1, Math.trunc(totalRoundsInput || 1));

  return {
    schedule: {
      id: schedule?._id?.toString() ?? null,
      status: schedule?.status ?? null,
      currentRound:
        schedule?.currentRound != null ? Math.trunc(schedule.currentRound) : 1,
      totalRounds,
    },
    matches,
  };
}
