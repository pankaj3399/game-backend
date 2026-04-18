import type { Types } from "mongoose";
import type { GameStatus, MatchType } from "../../../types/domain/game";
import type { ScheduleStatus } from "../../../types/domain/schedule";

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

export interface PopulatedMatchCourtDoc {
  _id: Types.ObjectId;
  name?: string | null;
}

export interface GameForMatchesDoc {
  _id: Types.ObjectId;
  teams: [
    { players: Array<PopulatedMatchPlayerDoc | Types.ObjectId | null> },
    { players: Array<PopulatedMatchPlayerDoc | Types.ObjectId | null> }
  ];
  court?: PopulatedMatchCourtDoc | null;
  score?: {
    playerOneScores?: Array<number | "wo">;
    playerTwoScores?: Array<number | "wo">;
  };
  status: GameStatus;
  matchType: MatchType;
  startTime?: Date | null;
}

export type MatchScoreValueResponse = number | "wo";

export interface MatchScoreResponse {
  playerOneScores: MatchScoreValueResponse[];
  playerTwoScores: MatchScoreValueResponse[];
}

export type MatchStatusResponse =
  | "completed"
  | "inProgress"
  | "scheduled"
  | "cancelled";

export interface MatchPlayerResponse {
  id: string;
  name: string | null;
  alias: string | null;
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
  status: MatchStatusResponse;
  startTime: string | null;
  score: MatchScoreResponse;
  court: MatchCourtResponse;
  players: [MatchPlayerResponse, MatchPlayerResponse];
  teams?: [
    [MatchPlayerResponse, MatchPlayerResponse | null],
    [MatchPlayerResponse, MatchPlayerResponse | null]
  ];
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
