import type { Types } from "mongoose";
import type { GamePlayMode, MatchType } from "../../../types/domain/game";
import type { RecordMatchScoreInput } from "../recordMatchScore/validation";
import type { ScoreQrFlowKind, ScoreQrTokenPayload } from "../../../shared/scoreQrToken";
export type {
  ScoreQrFlowKind,
  ScoreQrTokenPayload,
} from "../../../shared/scoreQrToken";

export interface GenerateScoreQrInput {
  tournamentId?: string | null;
  matchId?: string | null;
  requesterUserId: string;
  input: RecordMatchScoreInput;
  independentMatchType?: MatchType;
  independentPlayMode?: GamePlayMode;
  publicBaseUrl?: string | null;
}

export interface GenerateScoreQrResult {
  requestId: string;
  token: string;
  qrDataUrl: string;
  validationUrl: string;
  expiresAt: string;
  matchId: string;
  tournamentId: string | null;
  flow: ScoreQrFlowKind;
}

export interface ValidateScoreQrTokenResult {
  valid: boolean;
  reason:
    | "ok"
    | "malformed"
    | "invalid_signature"
    | "expired"
    | "request_not_found"
    | "request_not_pending"
    | "request_expired"
    | "request_match_mismatch";
  request: null | {
    id: string;
    flow: ScoreQrFlowKind;
    tournamentId: string | null;
    matchId: string;
    requestByUserId: string;
    opponentUserId: string | null;
    playerOneScores: Array<number | "wo">;
    playerTwoScores: Array<number | "wo">;
    playMode: GamePlayMode;
    matchType: MatchType;
    expiresAt: string;
  };
}

export interface ConfirmScoreQrInput {
  token: string;
  confirmerUserId: string;
}

export interface ConfirmScoreQrResult {
  matchId: string;
  tournamentId: string | null;
  matchStatus: "completed" | "pendingScore";
  tournamentCompleted: boolean;
  updatedRatings: Array<{
    userId: string;
    rating: number;
    rd: number;
    vol: number;
  }>;
  requestId: string;
  consumedAt: string;
}

export interface ActiveScoreQrSessionResult {
  requestId: string;
  token: string;
  flow: ScoreQrFlowKind;
  tournamentId: string | null;
  matchId: string;
  requestByUserId: string;
  opponentUserId: string | null;
  playerOneScores: Array<number | "wo">;
  playerTwoScores: Array<number | "wo">;
  playMode: GamePlayMode;
  matchType: MatchType;
  expiresAt: string;
  validationUrl: string;
  qrDataUrl: string;
}

export type TournamentGameForScoreQr = {
  _id: Types.ObjectId;
  tournament: Types.ObjectId;
  side1: { players: Types.ObjectId[] };
  side2: { players: Types.ObjectId[] };
  playMode: GamePlayMode;
  matchType: MatchType;
  status: string;
};

export type ScoreValidationRequestLean = {
  _id: Types.ObjectId;
  token: string;
  tokenHash: string;
  status: "pending" | "consumed" | "expired" | "cancelled";
  expiresAt: Date;
  tournament: Types.ObjectId | null;
  match: Types.ObjectId;
  requestByUser: Types.ObjectId;
  opponentUser: Types.ObjectId | null;
  playerOneScores: Array<number | "wo">;
  playerTwoScores: Array<number | "wo">;
  playMode: GamePlayMode;
  matchType: MatchType;
};
