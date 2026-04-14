import type { Types } from "mongoose";
import type { GameStatus } from "../../../types/domain/game";
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
  playerOne: PopulatedMatchPlayerDoc | null;
  playerTwo: PopulatedMatchPlayerDoc | null;
  court?: PopulatedMatchCourtDoc | null;
  status: GameStatus;
  startTime?: Date | null;
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
  status: MatchStatusResponse;
  startTime: string | null;
  court: MatchCourtResponse;
  players: [MatchPlayerResponse, MatchPlayerResponse];
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
