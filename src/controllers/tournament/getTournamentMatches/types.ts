import type { Types } from "mongoose";
import type { GamePlayMode, GameStatus, MatchType } from "../../../types/domain/game";
import type { MatchPlayerResponse, MatchStatusResponse } from "../../../types/domain/match";
import type { ScheduleStatus } from "../../../types/domain/schedule";

export type { MatchPlayerResponse, MatchStatusResponse };

export interface ScheduleRoundDoc {
  game: Types.ObjectId;
  slot: number;
  round: number;
}

export interface ScheduleForMatchesDoc {
  _id: Types.ObjectId;
  status: ScheduleStatus;
  currentRound: number;
  matchDurationMinutes?: number | null;
  rounds: ScheduleRoundDoc[];
}

export interface PopulatedMatchPlayerDoc {
  _id: Types.ObjectId;
  name?: string | null;
  alias?: string | null;
}

/**
 * One roster slot on a team for `getTournamentMatches` / `GameForMatchesDoc`.
 * `fetchGamesForScheduleRounds` always populates side players, so each
 * non-null slot is a populated player subdocument — not a bare ObjectId.
 * `null` is an empty slot on the roster.
 */
export type GameMatchPlayerSlot = PopulatedMatchPlayerDoc | null;

export interface PopulatedMatchCourtDoc {
  _id: Types.ObjectId;
  name?: string | null;
}

export interface GameForMatchesDoc {
  _id: Types.ObjectId;
  side1: { players: GameMatchPlayerSlot[] };
  side2: { players: GameMatchPlayerSlot[] };
  court?: PopulatedMatchCourtDoc | null;
  score?: {
    playerOneScores?: Array<number | "wo">;
    playerTwoScores?: Array<number | "wo">;
  };
  status: GameStatus;
  matchType: MatchType;
  playMode: GamePlayMode;
  startTime?: Date | null;
}

export type MatchScoreValueResponse = number | "wo";

export interface MatchScoreResponse {
  playerOneScores: MatchScoreValueResponse[];
  playerTwoScores: MatchScoreValueResponse[];
}

export interface MatchCourtResponse {
  id: string | null;
  name: string | null;
}

export interface TournamentMatchResponse {
  id: string;
  round: number;
  slot: number;
  mode: MatchType;
  playMode: GamePlayMode;
  status: MatchStatusResponse;
  startTime: string | null;
  score: MatchScoreResponse;
  court: MatchCourtResponse;
  players: [MatchPlayerResponse, MatchPlayerResponse];
  side1: [MatchPlayerResponse, MatchPlayerResponse | null];
  side2: [MatchPlayerResponse, MatchPlayerResponse | null];
}

export interface TournamentMatchesResponse {
  schedule: {
    id: string | null;
    status: ScheduleStatus | null;
    currentRound: number;
    totalRounds: number;
  };
  matches: TournamentMatchResponse[];
}
