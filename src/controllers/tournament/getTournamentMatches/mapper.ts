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

const EMPTY_PLAYER: MatchPlayerResponse = {
  id: "",
  name: null,
  alias: null,
};

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

  return {
    id: player._id.toString(),
    name: player.name ?? null,
    alias: player.alias ?? null,
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
) {
  if (!game?.side1 || !game.side2) {
    return null;
  }

  const team1 = mapTeam(game.side1);
  const team2 = mapTeam(game.side2);

  const playerOne = team1[0] ?? EMPTY_PLAYER;
  const playerTwo = team2[0] ?? EMPTY_PLAYER;

  const players = [playerOne, playerTwo];
  const side1 = [playerOne, team1[1] ?? null];
  const side2 = [playerTwo, team2[1] ?? null];

  const base = {
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

  return {
    ...base,
  };
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
