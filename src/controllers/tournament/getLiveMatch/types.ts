import type { Types } from "mongoose";
import type {
  GamePlayMode,
  GameStatus,
  MatchType,
} from "../../../types/domain/game";
import type {
  MatchPlayerResponse,
  MatchStatusResponse,
} from "../../../types/domain/match";

export type { MatchPlayerResponse, MatchStatusResponse };

export interface LiveMatchResponseItem {
  id: string;
  mode: MatchType;
  playMode: GamePlayMode;
  status: MatchStatusResponse;
  /** Schedule round when known (from tournament schedule or detached replay). */
  round: number | null;
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
  profilePictureUrl?: string | null;
}

export interface LiveMatchGameDoc {
  _id: Types.ObjectId;
  status: GameStatus;
  startTime?: Date | null;
  matchType: MatchType;
  playMode: GamePlayMode;
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
  detachedFromRound?: number | null;
  schedule?: {
    _id: Types.ObjectId;
    matchDurationMinutes?: number | null;
    rounds?: Array<{
      game: Types.ObjectId;
      round: number;
      slot: number;
    }>;
  } | null;
  court?: {
    _id: Types.ObjectId;
    name?: string | null;
  } | null;
}
