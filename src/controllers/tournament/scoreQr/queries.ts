import { Types } from "mongoose";
import Game from "../../../models/Game";
import ScoreValidationRequest from "../../../models/ScoreValidationRequest";
import { AppError } from "../../../shared/errors";
import type { GamePlayMode, MatchType } from "../../../types/domain/game";
import type { RecordMatchScoreInput } from "../recordMatchScore/validation";
import {
  normalizeIndependentMatchType,
  normalizeIndependentPlayMode,
} from "./scoreHelpers";
import type {
  ScoreValidationRequestLean,
  TournamentGameForScoreQr,
} from "./types";

export async function findTournamentGame(input: {
  tournamentId: string;
  matchId: string;
}): Promise<TournamentGameForScoreQr | null> {
  return Game.findOne({
    _id: input.matchId,
    tournament: input.tournamentId,
    gameMode: "tournament",
  })
    .select("_id tournament side1 side2 playMode matchType status")
    .lean<TournamentGameForScoreQr | null>()
    .exec();
}

export async function createStandaloneMatchForQr(input: {
  requesterUserId: string;
  scoreInput: RecordMatchScoreInput;
  matchType?: MatchType;
  playMode?: GamePlayMode;
}): Promise<{
  matchId: string;
  playMode: GamePlayMode;
  matchType: MatchType;
  opponentUserId: string | null;
}> {
  const matchType = normalizeIndependentMatchType(input.matchType);
  const playMode = normalizeIndependentPlayMode(input.scoreInput, input.playMode);

  const game = await Game.create({
    side1: { players: [new Types.ObjectId(input.requesterUserId)] },
    side2: { players: [] },
    score: {
      playerOneScores: [],
      playerTwoScores: [],
    },
    status: "pendingScore",
    gameMode: "standalone",
    matchType,
    playMode,
    startTime: new Date(),
  });

  return {
    matchId: game._id.toString(),
    playMode,
    matchType,
    opponentUserId: null,
  };
}

export function getOpponentUserIdFromGame(
  game: {
    side1: { players: Types.ObjectId[] };
    side2: { players: Types.ObjectId[] };
  },
  requesterUserId: string,
): string | null {
  const side1 = (game.side1?.players ?? []).map((id) => id.toString());
  const side2 = (game.side2?.players ?? []).map((id) => id.toString());

  const requesterInSide1 = side1.includes(requesterUserId);
  const requesterInSide2 = side2.includes(requesterUserId);

  if (!requesterInSide1 && !requesterInSide2) {
    throw new AppError("Requester is not a participant in this match", 403);
  }

  const opponents = requesterInSide1 ? side2 : side1;

  if (opponents.length === 0) {
    throw new AppError(
      "No opposing participant found for this match",
      409,
    );
  }

  if (opponents.length === 1) {
    return opponents[0];
  }

  // Team-vs-team contexts (for example, doubles) allow any opponent-side member
  // to confirm, so we intentionally avoid pinning to a single user id.
  return null;
}

export async function assertTournamentConfirmerEligibility(input: {
  matchId: string;
  tournamentId: string;
  requesterUserId: string;
  confirmerUserId: string;
}): Promise<void> {
  const game = await Game.findOne({
    _id: input.matchId,
    tournament: input.tournamentId,
    gameMode: "tournament",
  })
    .select("_id side1 side2")
    .lean<{
      _id: Types.ObjectId;
      side1: { players: Types.ObjectId[] };
      side2: { players: Types.ObjectId[] };
    } | null>()
    .exec();

  if (!game) {
    throw new AppError("Tournament match not found", 404);
  }

  const side1 = (game.side1?.players ?? []).map((id) => id.toString());
  const side2 = (game.side2?.players ?? []).map((id) => id.toString());

  const requesterInSide1 = side1.includes(input.requesterUserId);
  const requesterInSide2 = side2.includes(input.requesterUserId);
  if (!requesterInSide1 && !requesterInSide2) {
    throw new AppError("Requester is not a participant in this match", 403);
  }

  const confirmerInSide1 = side1.includes(input.confirmerUserId);
  const confirmerInSide2 = side2.includes(input.confirmerUserId);
  const requesterAndConfirmerSameSide =
    (requesterInSide1 && confirmerInSide1) || (requesterInSide2 && confirmerInSide2);
  if (requesterAndConfirmerSameSide) {
    throw new AppError("You are not allowed to confirm this score.", 403);
  }

  if (!confirmerInSide1 && !confirmerInSide2) {
    throw new AppError("You are not allowed to confirm this score.", 403);
  }
}

export async function expireStalePendingRequests(input: {
  tournamentId: string | null;
  matchId: string;
  requesterUserId: string;
  opponentUserId: string | null;
}): Promise<void> {
  const now = new Date();

  await ScoreValidationRequest.updateMany(
    {
      tournament: input.tournamentId,
      match: input.matchId,
      requestByUser: input.requesterUserId,
      opponentUser: input.opponentUserId,
      status: "pending",
      expiresAt: { $lte: now },
    },
    { $set: { status: "expired" } },
  ).exec();
}

export async function cancelPendingRequests(input: {
  tournamentId: string | null;
  matchId: string;
  requesterUserId: string;
  opponentUserId: string | null;
}): Promise<void> {
  await ScoreValidationRequest.updateMany(
    {
      tournament: input.tournamentId,
      match: input.matchId,
      requestByUser: input.requesterUserId,
      opponentUser: input.opponentUserId,
      status: "pending",
    },
    { $set: { status: "cancelled" } },
  ).exec();
}

export async function findScoreValidationRequestById(
  requestId: string,
): Promise<ScoreValidationRequestLean | null> {
  return ScoreValidationRequest.findById(requestId)
    .select(
      "_id token tokenHash status expiresAt tournament match requestByUser opponentUser playerOneScores playerTwoScores playMode matchType",
    )
    .lean<ScoreValidationRequestLean | null>()
    .exec();
}

export async function findLatestActivePendingRequestByContext(input: {
  requesterUserId: string;
  flow?: "tournament" | "independent";
  tournamentId?: string | null;
  matchId?: string | null;
  playMode?: GamePlayMode;
  matchType?: MatchType;
}): Promise<ScoreValidationRequestLean | null> {
  const now = new Date();
  const query: Record<string, unknown> = {
    requestByUser: input.requesterUserId,
    status: "pending",
    expiresAt: { $gt: now },
  };

  if (input.flow === "tournament") {
    query.tournament = { $ne: null };
  } else if (input.flow === "independent") {
    query.tournament = null;
  }

  if (input.tournamentId != null) {
    query.tournament = input.tournamentId;
  }
  if (input.matchId != null) {
    query.match = input.matchId;
  }
  if (input.playMode != null) {
    query.playMode = input.playMode;
  }
  if (input.matchType != null) {
    query.matchType = input.matchType;
  }

  return ScoreValidationRequest.findOne(query)
    .sort({ createdAt: -1 })
    .select(
      "_id token tokenHash status expiresAt tournament match requestByUser opponentUser playerOneScores playerTwoScores playMode matchType",
    )
    .lean<ScoreValidationRequestLean | null>()
    .exec();
}

export async function markRequestExpiredIfPending(
  requestId: Types.ObjectId,
): Promise<void> {
  await ScoreValidationRequest.updateOne(
    { _id: requestId, status: "pending" },
    { $set: { status: "expired" } },
  ).exec();
}

export async function attachConfirmerToStandaloneMatchIfNeeded(input: {
  requestMatchId: string;
  requestByUserId: string;
  confirmerUserId: string;
  playMode: GamePlayMode;
  matchType: MatchType;
}): Promise<void> {
  const game = await Game.findById(input.requestMatchId)
    .select("_id gameMode side1 side2 status playMode matchType")
    .exec();

  if (!game) {
    throw new AppError("Independent match not found", 404);
  }

  if (game.gameMode !== "standalone") {
    return;
  }

  if (game.status === "finished" || game.status === "cancelled") {
    throw new AppError("Match is already closed", 409);
  }

  const side1 = Array.isArray(game.side1?.players)
    ? game.side1.players.map((p) => p.toString())
    : [];
  const side2 = Array.isArray(game.side2?.players)
    ? game.side2.players.map((p) => p.toString())
    : [];

  const requesterInSide1 = side1.includes(input.requestByUserId);
  const requesterInSide2 = side2.includes(input.requestByUserId);

  if (!requesterInSide1 && !requesterInSide2) {
    throw new AppError("Requester is not a participant in this match", 403);
  }

  if (input.confirmerUserId === input.requestByUserId) {
    throw new AppError("Requester cannot confirm their own independent QR", 403);
  }

  const confirmerInSide1 = side1.includes(input.confirmerUserId);
  const confirmerInSide2 = side2.includes(input.confirmerUserId);
  if (confirmerInSide1 || confirmerInSide2) {
    return;
  }

  const requesterSide = requesterInSide1 ? "side1" : "side2";
  const opponentSide = requesterSide === "side1" ? "side2" : "side1";
  const opponentPlayers = Array.isArray(game[opponentSide]?.players)
    ? game[opponentSide].players
    : [];

  if (opponentPlayers.length > 0) {
    throw new AppError("Independent match already has an opponent", 409);
  }

  game[opponentSide].players = [new Types.ObjectId(input.confirmerUserId)];
  game.matchType = input.matchType;
  game.playMode = input.playMode;
  game.status = "pendingScore";
  game.startTime = game.startTime ?? new Date();

  await game.save();
}
