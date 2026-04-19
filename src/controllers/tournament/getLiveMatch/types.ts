import type { Types } from "mongoose";
import type { GameStatus, MatchType } from "../../../types/domain/game";
import type { MatchPlayerResponse, MatchStatusResponse } from "../../../types/domain/match";

export type { MatchPlayerResponse, MatchStatusResponse };

export interface LiveMatchResponseItem {
  id: string;
  mode: MatchType;
  status: MatchStatusResponse;
  startTime: string | null;
  tournament: {
    id: string | null;
    name: string;
  };
  court: {
    id: string | null;
    name: string | null;
  };
  myTeam: MatchPlayerResponse[];
  opponentTeam: MatchPlayerResponse[];
}

export interface PopulatedPlayer {
  _id: Types.ObjectId;
  name?: string | null;
  alias?: string | null;
}

export interface LiveMatchGameDoc {
  _id: Types.ObjectId;
  status: GameStatus;
  startTime?: Date | null;
  matchType: MatchType;
  side1: {
    players: Array<PopulatedPlayer | Types.ObjectId | null>;
  };
  side2: {
    players: Array<PopulatedPlayer | Types.ObjectId | null>;
  };
  tournament?: {
    _id: Types.ObjectId;
    name?: string | null;
    duration?: number | null;
  } | null;
  schedule?: {
    _id: Types.ObjectId;
    matchDurationMinutes?: number | null;
  } | null;
  court?: {
    _id: Types.ObjectId;
    name?: string | null;
  } | null;
}
