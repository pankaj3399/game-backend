import crypto from "crypto";
import QRCode from "qrcode";
import { Types } from "mongoose";
import Game from "../../../models/Game";
import ScoreValidationRequest from "../../../models/ScoreValidationRequest";
import Tournament from "../../../models/Tournament";
import User from "../../../models/User";
import { TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_HOURS } from "../../../lib/config";
import { AppError } from "../../../shared/errors";
import {
  buildScoreQrValidationUrl,
  SCORE_QR_TOKEN_TTL_SECONDS,
  signScoreQrToken,
  verifyAndDecodeScoreQrToken,
  type ScoreQrTokenPayload,
} from "../../../shared/scoreQrToken";
import type { GamePlayMode, MatchType } from "../../../types/domain/game";
import { hasTournamentScheduleAccess } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import { recordTournamentMatchScoreFlow } from "../recordMatchScore/handler";
import {
  assertTournamentConfirmerEligibility,
  assertStandaloneConfirmerEligibility,
  attachConfirmerToStandaloneMatchIfNeeded,
  cancelPendingRequests,
  createStandaloneMatchForQr,
  ensureStandaloneGameSnapshots,
  expireStalePendingRequests,
  findLatestActivePendingRequestByContext,
  findScoreValidationRequestById,
  findTournamentGame,
  getOpponentUserIdFromGame,
  markRequestExpiredIfPending,
} from "./queries";
import {
  normalizeIndependentPlayMode,
  normalizeMatchStatus,
  requiredSetCount,
  resolveWinnerBySets,
} from "./scoreHelpers";
import type {
  ConfirmScoreQrInput,
  ConfirmScoreQrResult,
  GenerateScoreQrInput,
  GenerateScoreQrResult,
  ActiveScoreQrSessionResult,
  ScoreQrFlowKind,
  ValidateScoreQrTokenResult,
} from "./types";

type ValidScoreQrRequest = NonNullable<ValidateScoreQrTokenResult["request"]>;

async function assertScoreQrConfirmEligibility(
  request: ValidScoreQrRequest,
  confirmerUserId: string,
): Promise<void> {
  if (request.flow === "tournament") {
    if (!request.tournamentId) {
      throw new AppError("Invalid tournament QR context", 409);
    }

    if (
      request.opponentUserId &&
      confirmerUserId !== request.opponentUserId
    ) {
      throw new AppError("You are not allowed to confirm this score.", 403);
    }

    await assertTournamentConfirmerEligibility({
      matchId: request.matchId,
      tournamentId: request.tournamentId,
      requesterUserId: request.requestByUserId,
      confirmerUserId,
    });
    return;
  }

  if (
    request.opponentUserId &&
    confirmerUserId !== request.opponentUserId
  ) {
    throw new AppError("You are not allowed to confirm this score.", 403);
  }

  await assertStandaloneConfirmerEligibility({
    requestMatchId: request.matchId,
    requestByUserId: request.requestByUserId,
    confirmerUserId,
  });
}

export async function generateScoreQrFlow(
  input: GenerateScoreQrInput,
) {
  if (!Types.ObjectId.isValid(input.requesterUserId)) {
    throw new AppError("Invalid requester user id", 400);
  }

  const tidTrimmed = input.tournamentId?.trim() ?? "";
  const midTrimmed = input.matchId?.trim() ?? "";
  const hasTournamentId = tidTrimmed.length > 0;
  const hasMatchId = midTrimmed.length > 0;

  if (hasTournamentId !== hasMatchId) {
    throw new AppError(
      hasTournamentId
        ? "matchId is required when tournamentId is provided"
        : "tournamentId is required when matchId is provided",
      400,
    );
  }

  const isTournamentFlow = hasTournamentId && hasMatchId;

  let flow: ScoreQrFlowKind = "independent";
  let tournamentId: string | null = null;
  let matchId: string;
  let playMode: GamePlayMode;
  let matchType: MatchType;
  let opponentUserId: string | null;

  if (isTournamentFlow) {
    const tid = tidTrimmed;
    const mid = midTrimmed;

    if (!Types.ObjectId.isValid(tid) || !Types.ObjectId.isValid(mid)) {
      throw new AppError("Invalid tournament or match id", 400);
    }

    const game = await findTournamentGame({ tournamentId: tid, matchId: mid });
    if (!game) {
      throw new AppError("Tournament match not found", 404);
    }

    if (game.status === "finished" || game.status === "cancelled") {
      throw new AppError(
        "Cannot generate score QR for completed/cancelled match",
        400,
      );
    }

    playMode = game.playMode;
    matchType = game.matchType;

    const maxSets = requiredSetCount(playMode);
    if (
      input.input.playerOneScores.length > maxSets ||
      input.input.playerTwoScores.length > maxSets
    ) {
      throw new AppError(`Too many sets for ${playMode}. Maximum is ${maxSets}`, 400);
    }

    flow = "tournament";
    tournamentId = tid;
    matchId = mid;
    opponentUserId = getOpponentUserIdFromGame(game, input.requesterUserId);

    await expireStalePendingRequests({
      tournamentId: tid,
      matchId: mid,
      requesterUserId: input.requesterUserId,
      opponentUserId,
    });

    await cancelPendingRequests({
      tournamentId: tid,
      matchId: mid,
      requesterUserId: input.requesterUserId,
      opponentUserId,
    });
  } else {
    const resolvedPlayMode = normalizeIndependentPlayMode(
      input.input,
      input.independentPlayMode,
    );
    const maxSets = requiredSetCount(resolvedPlayMode);
    if (
      input.input.playerOneScores.length > maxSets ||
      input.input.playerTwoScores.length > maxSets
    ) {
      throw new AppError(
        `Too many sets for ${resolvedPlayMode}. Maximum is ${maxSets}`,
        400,
      );
    }

    await expireStalePendingRequests({
      tournamentId: null,
      requesterUserId: input.requesterUserId,
      opponentUserId: null,
    });

    await cancelPendingRequests({
      tournamentId: null,
      requesterUserId: input.requesterUserId,
      opponentUserId: null,
    });

    const created = await createStandaloneMatchForQr({
      requesterUserId: input.requesterUserId,
      scoreInput: input.input,
      matchType: input.independentMatchType,
      playMode: input.independentPlayMode,
    });

    flow = "independent";
    tournamentId = null;
    matchId = created.matchId;
    playMode = created.playMode;
    matchType = created.matchType;
    opponentUserId = created.opponentUserId;
  }

  const requestId = new Types.ObjectId();
  const token = signScoreQrToken({
    jti: crypto.randomBytes(16).toString("hex"),
    sid: requestId.toString(),
    flow,
    tid: tournamentId,
    mid: matchId,
    rby: input.requesterUserId,
    opp: opponentUserId,
  });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const pendingDoc = await ScoreValidationRequest.create({
    _id: requestId,
    token,
    tokenHash,
    requestByUser: input.requesterUserId,
    opponentUser: opponentUserId,
    tournament: tournamentId,
    match: matchId,
    playerOneScores: input.input.playerOneScores,
    playerTwoScores: input.input.playerTwoScores,
    playMode,
    matchType,
    status: "pending",
    expiresAt: new Date(Date.now() + SCORE_QR_TOKEN_TTL_SECONDS * 1000),
    consumedAt: null,
    consumedBy: null,
  });

  const validationUrl = buildScoreQrValidationUrl(token, input.publicBaseUrl);
  const qrDataUrl = await QRCode.toDataURL(validationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });

  return {
    requestId: pendingDoc._id.toString(),
    token,
    qrDataUrl,
    validationUrl,
    expiresAt: pendingDoc.expiresAt.toISOString(),
    matchId,
    tournamentId,
    flow,
  };
}

export async function validateScoreQrTokenFlow(
  token: string,
): Promise<ValidateScoreQrTokenResult> {
  let payload: ScoreQrTokenPayload;
  try {
    payload = verifyAndDecodeScoreQrToken(token);
  } catch (error) {
    const err = error as Error;
    if (err.message.toLowerCase().includes("expired")) {
      return { valid: false, reason: "expired", request: null };
    }
    if (err.message.toLowerCase().includes("signature")) {
      return { valid: false, reason: "invalid_signature", request: null };
    }
    return { valid: false, reason: "malformed", request: null };
  }

  if (
    !Types.ObjectId.isValid(payload.sid) ||
    !Types.ObjectId.isValid(payload.mid) ||
    !Types.ObjectId.isValid(payload.rby) ||
    (payload.tid !== null && !Types.ObjectId.isValid(payload.tid)) ||
    (payload.opp !== null && !Types.ObjectId.isValid(payload.opp))
  ) {
    return { valid: false, reason: "malformed", request: null };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const request = await findScoreValidationRequestById(payload.sid);

  if (!request) {
    return { valid: false, reason: "request_not_found", request: null };
  }

  if (request.tokenHash !== tokenHash) {
    return { valid: false, reason: "invalid_signature", request: null };
  }

  if (
    request.match.toString() !== payload.mid ||
    request.requestByUser.toString() !== payload.rby ||
    (request.tournament ? request.tournament.toString() : null) !== payload.tid ||
    (request.opponentUser ? request.opponentUser.toString() : null) !== payload.opp
  ) {
    return { valid: false, reason: "request_match_mismatch", request: null };
  }

  const now = new Date();
  if (request.expiresAt.getTime() <= now.getTime()) {
    if (request.status === "pending") {
      await markRequestExpiredIfPending(request._id);
    }
    return { valid: false, reason: "request_expired", request: null };
  }

  if (request.status !== "pending") {
    return { valid: false, reason: "request_not_pending", request: null };
  }

  return {
    valid: true,
    reason: "ok",
    request: {
      id: request._id.toString(),
      flow: payload.flow,
      tournamentId: request.tournament ? request.tournament.toString() : null,
      matchId: request.match.toString(),
      requestByUserId: request.requestByUser.toString(),
      opponentUserId: request.opponentUser ? request.opponentUser.toString() : null,
      playerOneScores: request.playerOneScores,
      playerTwoScores: request.playerTwoScores,
      playMode: request.playMode,
      matchType: request.matchType,
      expiresAt: request.expiresAt.toISOString(),
    },
  };
}

export async function validateScoreQrConfirmContextFlow(input: {
  token: string;
  confirmerUserId: string;
}): Promise<ValidateScoreQrTokenResult> {
  const validation = await validateScoreQrTokenFlow(input.token);
  if (!validation.valid || !validation.request) {
    return validation;
  }

  await assertScoreQrConfirmEligibility(
    validation.request,
    input.confirmerUserId,
  );

  return validation;
}

export async function confirmScoreQrFlow(
  input: ConfirmScoreQrInput,
): Promise<ConfirmScoreQrResult> {
  const validation = await validateScoreQrTokenFlow(input.token);
  if (!validation.valid || !validation.request) {
    const reason = validation.reason;
    if (reason === "expired" || reason === "request_expired") {
      throw new AppError("QR request expired", 410);
    }
    if (reason === "request_not_pending") {
      throw new AppError("QR request has already been used or cancelled", 409);
    }
    if (reason === "request_not_found") {
      throw new AppError("QR request not found", 404);
    }
    throw new AppError("Invalid QR token", 400);
  }

  const request = validation.request;

  await assertScoreQrConfirmEligibility(request, input.confirmerUserId);

  if (request.flow === "independent") {
    await attachConfirmerToStandaloneMatchIfNeeded({
      requestMatchId: request.matchId,
      requestByUserId: request.requestByUserId,
      confirmerUserId: input.confirmerUserId,
      playMode: request.playMode,
      matchType: request.matchType,
    });
  }

  const game = await Game.findById(request.matchId)
    .select("_id gameMode tournament status")
    .lean<{
      _id: Types.ObjectId;
      gameMode: "tournament" | "standalone";
      tournament?: Types.ObjectId | null;
      status: string;
    } | null>()
    .exec();

  if (!game) {
    throw new AppError("Match not found", 404);
  }

  if (game.status === "finished" || game.status === "cancelled") {
    throw new AppError("Match is already closed", 409);
  }

  const now = new Date();
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");

  const consumeQuery: Record<string, unknown> = {
    _id: request.id,
    tokenHash,
    status: "pending",
    expiresAt: { $gt: now },
  };

  if (request.flow === "tournament" && request.opponentUserId) {
    consumeQuery.opponentUser = input.confirmerUserId;
  }

  const consumeResult = await ScoreValidationRequest.findOneAndUpdate(
    consumeQuery,
    {
      $set: {
        status: "consumed",
        consumedAt: now,
        consumedBy: input.confirmerUserId,
      },
    },
    {
      returnDocument: "after",
      select: "_id consumedAt",
    },
  )
    .lean<{ _id: Types.ObjectId; consumedAt: Date | null } | null>()
    .exec();

  if (!consumeResult) {
    throw new AppError("QR request is no longer valid for confirmation", 409);
  }

  try {
    if (request.flow === "tournament" && request.tournamentId) {
      const tournamentContext = await fetchTournamentScheduleContext(
        request.tournamentId,
      );
      if (!tournamentContext) {
        throw new AppError("Tournament not found", 404);
      }

      const confirmer = await User.findById(input.confirmerUserId).exec();
      if (!confirmer) {
        throw new AppError("Confirmer user not found", 404);
      }

      const isOrganiser = await hasTournamentScheduleAccess(
        tournamentContext,
        confirmer,
      );
      const meta = await Tournament.findById(request.tournamentId)
        .select("completedAt")
        .lean<{ completedAt?: Date | null } | null>()
        .exec();
      const completedAt = meta?.completedAt ?? null;

      const graceHours = TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_HOURS;
      const organiserGraceExpired =
        isOrganiser &&
        completedAt instanceof Date &&
        Date.now() > completedAt.getTime() + graceHours * 60 * 60 * 1000;
      const tournamentCompleted =
        completedAt instanceof Date && Date.now() > completedAt.getTime();

      const saveResult = await recordTournamentMatchScoreFlow(
        request.tournamentId,
        request.matchId,
        {
          playerOneScores: request.playerOneScores,
          playerTwoScores: request.playerTwoScores,
        },
        {
          actor: isOrganiser ? "organiser" : "participant",
          organiserGraceExpired,
          tournamentCompleted,
        },
      );

      return {
        ...saveResult,
        requestId: request.id,
        consumedAt: (consumeResult.consumedAt ?? now).toISOString(),
      };
    }

    const standalone = await Game.findById(request.matchId).exec();
    if (!standalone) {
      throw new AppError("Independent match not found", 404);
    }

    if (standalone.gameMode !== "standalone") {
      throw new AppError("Invalid independent match context", 409);
    }

    if (standalone.status === "finished" || standalone.status === "cancelled") {
      throw new AppError("Match is already closed", 409);
    }

    await ensureStandaloneGameSnapshots(standalone);

    const winner = resolveWinnerBySets(request.playMode, {
      playerOneScores: request.playerOneScores,
      playerTwoScores: request.playerTwoScores,
    });

    standalone.score = {
      playerOneScores: [...request.playerOneScores],
      playerTwoScores: [...request.playerTwoScores],
    };
    standalone.status = winner ? "finished" : "pendingScore";
    standalone.startTime = standalone.startTime ?? now;
    standalone.endTime = winner ? now : undefined;

    await standalone.save();

    return {
      matchId: standalone._id.toString(),
      tournamentId: null,
      matchStatus: normalizeMatchStatus(standalone.status),
      tournamentCompleted: false,
      updatedRatings: [],
      requestId: request.id,
      consumedAt: (consumeResult.consumedAt ?? now).toISOString(),
    };
  } catch (error) {
    await ScoreValidationRequest.updateOne(
      {
        _id: request.id,
        status: "consumed",
        consumedBy: input.confirmerUserId,
      },
      {
        $set: {
          status: "pending",
          consumedAt: null,
          consumedBy: null,
        },
      },
    ).exec();

    throw error;
  }
}

export async function getActiveScoreQrSessionFlow(input: {
  requesterUserId: string;
  flow?: "tournament" | "independent";
  tournamentId?: string | null;
  matchId?: string | null;
  playMode?: GamePlayMode;
  matchType?: MatchType;
  publicBaseUrl?: string | null;
}): Promise<ActiveScoreQrSessionResult | null> {
  const request = await findLatestActivePendingRequestByContext({
    requesterUserId: input.requesterUserId,
    flow: input.flow,
    tournamentId: input.tournamentId,
    matchId: input.matchId,
    playMode: input.playMode,
    matchType: input.matchType,
  });

  if (!request) {
    return null;
  }

  const match = await Game.findById(request.match)
    .select("_id tournament gameMode status")
    .lean<{
      _id: Types.ObjectId;
      tournament?: Types.ObjectId | null;
      gameMode: "tournament" | "standalone";
      status: string;
    } | null>()
    .exec();

  if (!match || match.status === "finished" || match.status === "cancelled") {
    await ScoreValidationRequest.updateOne(
      { _id: request._id, status: "pending" },
      { $set: { status: "expired" } },
    ).exec();
    return null;
  }

  const expectedTournamentId = request.tournament ? request.tournament.toString() : null;
  const matchTournamentId = match.tournament ? match.tournament.toString() : null;
  if (expectedTournamentId !== matchTournamentId) {
    await ScoreValidationRequest.updateOne(
      { _id: request._id, status: "pending" },
      { $set: { status: "cancelled" } },
    ).exec();
    return null;
  }

  const validationUrl = buildScoreQrValidationUrl(request.token, input.publicBaseUrl);
  const qrDataUrl = await QRCode.toDataURL(validationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });

  return {
    requestId: request._id.toString(),
    token: request.token,
    flow: request.tournament ? "tournament" : "independent",
    tournamentId: expectedTournamentId,
    matchId: request.match.toString(),
    requestByUserId: request.requestByUser.toString(),
    opponentUserId: request.opponentUser ? request.opponentUser.toString() : null,
    playerOneScores: request.playerOneScores,
    playerTwoScores: request.playerTwoScores,
    playMode: request.playMode,
    matchType: request.matchType,
    expiresAt: request.expiresAt.toISOString(),
    validationUrl,
    qrDataUrl,
  };
}
