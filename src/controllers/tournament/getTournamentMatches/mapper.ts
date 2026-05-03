import type { GamePlayMode, GameStatus, MatchType } from "../../../types/domain/game";
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

function mapStatus(status: GameStatus | undefined): MatchStatusResponse {
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

function normalizeMatchType(value: unknown): MatchType {
  return value === "doubles" ? "doubles" : "singles";
}

function normalizePlayMode(value: unknown): GamePlayMode {
  switch (value) {
    case "TieBreak10":
    case "1set":
    case "3setTieBreak10":
    case "3set":
    case "5set":
      return value;
    default:
      return "TieBreak10";
  }
}

function nullableInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = nullableInteger(value);
  return parsed != null && parsed >= 1 ? parsed : fallback;
}

function dateToIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  return null;
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

function mapPlayer(player: GameMatchPlayerSlot, snapshot: { rating: number; rd: number } | null) {
  if (player == null) {
    return null;
  }

  return {
    id: player._id.toString(),
    name: player.name ?? null,
    alias: player.alias ?? null,
    snapshotElo: snapshot ? { rating: snapshot.rating, rd: snapshot.rd } : null,
    elo: null,
  };
}

function mapTeam(team: GameForMatchesDoc["side1"] | GameForMatchesDoc["side2"]) {
  if (!team?.players || !Array.isArray(team.players)) {
    return [];
  }

  const out: MatchPlayerResponse[] = [];
  for (const player of team.players) {
    const snapshot =
      player == null
        ? null
        : (team.playerSnapshots ?? []).find((entry) => entry.player.toString() === player._id.toString()) ?? null;
    const mapped = mapPlayer(player, snapshot ? { rating: snapshot.rating, rd: snapshot.rd } : null);
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
    round: positiveInteger(entry.round, 1),
    slot: positiveInteger(entry.slot, 1),
    mode: normalizeMatchType(game.matchType),
    playMode: normalizePlayMode(game.playMode),
    status: mapStatus(game.status),
    startTime: dateToIso(game.startTime),
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
    isHistorical: game.isHistorical === true ? true : undefined,
    detachedFromRound: nullableInteger(game.detachedFromRound),
    detachedFromSlot: nullableInteger(game.detachedFromSlot),
  };

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
    if (g.isHistorical !== true) continue;
    const id = g._id.toString();
    // Skip if already represented by schedule entries
    if (matches.some((m) => m.id === id)) continue;
    const syntheticEntry = {
      game: g._id,
      round: positiveInteger(g.detachedFromRound, 1),
      slot: positiveInteger(g.detachedFromSlot, 1),
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
