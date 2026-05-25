import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import User from "../../../models/User";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { AppError, buildErrorPayload, buildZodErrorPayload } from "../../../shared/errors";
import { parseRouteObjectId, readRouteParam } from "../../../shared/validation";
import { authorizeScheduleOrMatchParticipant } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import {
  confirmScoreQrFlow,
  getActiveScoreQrSessionFlow,
  generateScoreQrFlow,
  updateScoreQrSessionScoresFlow,
  validateScoreQrConfirmContextFlow,
  validateScoreQrTokenFlow,
  cancelActiveScoreQrFlow,
} from "./handler";
import type { ValidateScoreQrTokenResult } from "./types";
import {
  publishScoreQrRequestEvent,
  subscribeScoreQrRequestEvents,
} from "./events";
import {
  activeScoreQrQuerySchema,
  confirmScoreQrBodySchema,
  generateIndependentScoreQrBodySchema,
  generateScoreQrBodySchema,
  scoreQrTokenParamsSchema,
  updateScoreQrScoresBodySchema,
} from "./validation";

type RequesterProfile = {
  name: string | null;
  alias: string | null;
  profilePictureUrl: string | null;
};

async function fetchRequesterProfile(userId: string): Promise<RequesterProfile | null> {
  try {
    const user = await User.findById(userId)
      .select("name alias profilePictureUrl")
      .lean<{ name?: string | null; alias?: string | null; profilePictureUrl?: string | null } | null>()
      .exec();
    if (!user) return null;
    return {
      name: user.name ?? null,
      alias: user.alias ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
    };
  } catch {
    return null;
  }
}

function validationFailurePayload(validation: ValidateScoreQrTokenResult) {
  const statusByReason: Record<string, number> = {
    expired: 410,
    request_expired: 410,
    request_not_found: 404,
    request_not_pending: 409,
    invalid_signature: 401,
    malformed: 400,
    request_match_mismatch: 409,
    ok: 400,
  };

  const messageByReason: Record<string, string> = {
    expired: "QR token has expired",
    request_expired: "QR request has expired",
    request_not_found: "QR request not found",
    request_not_pending: "QR request already consumed/cancelled",
    invalid_signature: "Invalid QR token signature",
    malformed: "Malformed QR token",
    request_match_mismatch: "QR token does not match persisted request",
    ok: "QR token is invalid",
  };

  const status = statusByReason[validation.reason] ?? 400;
  const message = messageByReason[validation.reason] ?? "QR token is invalid";

  return {
    status,
    body: {
      ...buildErrorPayload(message),
      reason: validation.reason,
    },
  };
}

function safeValidationRequest(
  validation: ValidateScoreQrTokenResult,
  requesterProfile: RequesterProfile | null = null,
) {
  const r = validation.request;
  if (!validation.valid || !r) return null;

  return {
    id: r.id,
    flow: r.flow,
    tournamentId: r.tournamentId,
    matchId: r.matchId,
    requestByUserId: r.requestByUserId,
    opponentUserId: r.opponentUserId,
    playerOneScores: r.playerOneScores,
    playerTwoScores: r.playerTwoScores,
    playMode: r.playMode,
    matchType: r.matchType,
    expiresAt: r.expiresAt,
    tournamentName: r.tournamentName,
    requestByUserProfile: requesterProfile,
  };
}

/**
 * POST /api/tournaments/:id/matches/:matchId/score/qr
 * Generates a one-time QR payload for opponent score confirmation.
 */
export async function generateScoreQr(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const tournamentIdResult = parseRouteObjectId(req.params.id, "tournament ID");
    if (tournamentIdResult.status !== 200) {
      res
        .status(tournamentIdResult.status)
        .json(buildErrorPayload(tournamentIdResult.message));
      return;
    }

    const matchIdResult = parseRouteObjectId(req.params.matchId, "match ID");
    if (matchIdResult.status !== 200) {
      res.status(matchIdResult.status).json(buildErrorPayload(matchIdResult.message));
      return;
    }

    const parsedBody = generateScoreQrBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const tournamentId = tournamentIdResult.data;
    const matchId = matchIdResult.data;
    const tournament = await fetchTournamentScheduleContext(tournamentId);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeScheduleOrMatchParticipant(
      tournament,
      req.user,
      {
        matchId,
      },
    );
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await generateScoreQrFlow({
      tournamentId,
      matchId,
      requesterUserId: req.user._id.toString(),
      input: parsedBody.data,
    });

    res.status(200).json({
      message: "Score QR generated successfully",
      flow: result.flow,
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
      },
      qr: {
        requestId: result.requestId,
        token: result.token,
        dataUrl: result.qrDataUrl,
        validationUrl: result.validationUrl,
        expiresAt: result.expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error generating score QR", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error generating score QR", { err });
    res.status(500).json(buildErrorPayload("Failed to generate score QR"));
  }
}

/**
 * POST /api/tournaments/score-qr/independent
 * Generates a one-time QR payload for opponent score confirmation
 * for an independent (non-tournament) match.
 */
export async function generateIndependentScoreQr(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const parsedBody = generateIndependentScoreQrBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const result = await generateScoreQrFlow({
      requesterUserId: req.user._id.toString(),
      input: {
        playerOneScores: parsedBody.data.playerOneScores,
        playerTwoScores: parsedBody.data.playerTwoScores,
      },
      independentMatchType: parsedBody.data.independentMatchType,
      independentPlayMode: parsedBody.data.independentPlayMode,
    });

    res.status(200).json({
      message: "Independent score QR generated successfully",
      flow: result.flow,
      qr: {
        requestId: result.requestId,
        token: result.token,
        dataUrl: result.qrDataUrl,
        validationUrl: result.validationUrl,
        expiresAt: result.expiresAt,
      },
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error generating independent score QR", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error generating independent score QR", { err });
    res
      .status(500)
      .json(buildErrorPayload("Failed to generate independent score QR"));
  }
}

/**
 * GET /api/tournaments/score-qr/:token
 * Validates a score QR token and returns request details if valid.
 */
export async function validateScoreQr(req: Request, res: Response) {
  try {
    const paramsResult = scoreQrTokenParamsSchema.safeParse({
      token: readRouteParam(req.params.token),
    });
    if (!paramsResult.success) {
      res.status(400).json(buildZodErrorPayload(paramsResult.error));
      return;
    }

    const { token } = paramsResult.data;
    const validation = await validateScoreQrTokenFlow(token);

    const requesterProfile = validation.valid && validation.request
      ? await fetchRequesterProfile(validation.request.requestByUserId)
      : null;

    const safeRequest = safeValidationRequest(validation, requesterProfile);
    if (!safeRequest) {
      const failure = validationFailurePayload(validation);
      res.status(failure.status).json(failure.body);
      return;
    }

    res.status(200).json({
      message: "QR token is valid",
      valid: true,
      reason: validation.reason,
      request: safeRequest,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error validating score QR", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error validating score QR", { err });
    res.status(500).json(buildErrorPayload("Failed to validate score QR"));
  }
}

/**
 * POST /api/tournaments/score-qr/confirm-context
 * Validates a QR token for the authenticated confirmer before exposing score details.
 */
export async function validateScoreQrConfirmContext(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const parsedBody = confirmScoreQrBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const validation = await validateScoreQrConfirmContextFlow({
      token: parsedBody.data.token,
      confirmerUserId: req.user._id.toString(),
    });

    const requesterProfile = validation.valid && validation.request
      ? await fetchRequesterProfile(validation.request.requestByUserId)
      : null;

    const safeRequest = safeValidationRequest(validation, requesterProfile);
    if (!safeRequest) {
      const failure = validationFailurePayload(validation);
      res.status(failure.status).json(failure.body);
      return;
    }

    res.status(200).json({
      message: "QR token is valid for this confirmer",
      valid: true,
      reason: validation.reason,
      request: safeRequest,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error validating score QR confirm context", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error validating score QR confirm context", { err });
    res.status(500).json(buildErrorPayload("Failed to validate score QR"));
  }
}

/**
 * POST /api/tournaments/score-qr/confirm
 * Confirms and persists score using a validated QR token (opponent flow).
 */
export async function confirmScoreQr(req: AuthenticatedRequest, res: Response) {
  try {
    const parsedBody = confirmScoreQrBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const result = await confirmScoreQrFlow({
      token: parsedBody.data.token,
      confirmerUserId: req.user._id.toString(),
    });

    const responseMessage =
      result.matchStatus === "completed"
        ? "Score confirmed and match completed"
        : "Score confirmed but winner is still pending";

    res.status(200).json({
      message: responseMessage,
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
        status: result.matchStatus,
      },
      tournamentCompleted: result.tournamentCompleted,
      ratings: result.updatedRatings,
      request: {
        id: result.requestId,
        consumedAt: result.consumedAt,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error confirming score QR", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error confirming score QR", { err });
    res.status(500).json(buildErrorPayload("Failed to confirm score QR"));
  }
}

/**
 * GET /api/tournaments/score-qr/active
 * Returns current authenticated user's active pending score validation session.
 */
export async function getActiveScoreQr(req: AuthenticatedRequest, res: Response) {
  try {
    const parsedQuery = activeScoreQrQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json(buildZodErrorPayload(parsedQuery.error));
      return;
    }

    const session = await getActiveScoreQrSessionFlow({
      requesterUserId: req.user._id.toString(),
      flow: parsedQuery.data.flow,
      tournamentId: parsedQuery.data.tournamentId ?? null,
      matchId: parsedQuery.data.matchId ?? null,
      playMode: parsedQuery.data.playMode,
      matchType: parsedQuery.data.matchType,
    });

    res.status(200).json({
      message: session
        ? "Active score QR session fetched"
        : "No active score QR session",
      session,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error fetching active score QR session", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error fetching active score QR session", { err });
    res
      .status(500)
      .json(buildErrorPayload("Failed to fetch active score QR session"));
  }
}

/**
 * PATCH /api/tournaments/score-qr/:requestId/scores
 * Updates the scores on an existing pending QR session in-place.
 * The QR token/URL stays unchanged so the opponent doesn't need to re-scan.
 */
export async function updateScoreQrScores(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const requestIdResult = parseRouteObjectId(req.params.requestId, "request ID");
    if (requestIdResult.status !== 200) {
      res.status(requestIdResult.status).json(buildErrorPayload(requestIdResult.message));
      return;
    }

    const parsedBody = updateScoreQrScoresBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const result = await updateScoreQrSessionScoresFlow({
      requestId: requestIdResult.data,
      requesterUserId: req.user._id.toString(),
      playerOneScores: parsedBody.data.playerOneScores,
      playerTwoScores: parsedBody.data.playerTwoScores,
    });

    publishScoreQrRequestEvent(result.requestId, "scores-updated", {
      playerOneScores: result.playerOneScores,
      playerTwoScores: result.playerTwoScores,
    });

    res.status(200).json({
      message: "QR session scores updated",
      requestId: result.requestId,
      playerOneScores: result.playerOneScores,
      playerTwoScores: result.playerTwoScores,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error updating score QR scores", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error updating score QR scores", { err });
    res.status(500).json(buildErrorPayload("Failed to update score QR scores"));
  }
}

export async function streamScoreQrEvents(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parsedParams = scoreQrTokenParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json(buildZodErrorPayload(parsedParams.error));
      return;
    }

    const validation = await validateScoreQrConfirmContextFlow({
      token: parsedParams.data.token,
      confirmerUserId: req.user._id.toString(),
    });

    if (!validation.valid || !validation.request) {
      const failure = validationFailurePayload(validation);
      res.status(failure.status).json(failure.body);
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    subscribeScoreQrRequestEvents({
      requestId: validation.request.id,
      response: res,
      onClose: () => {
        // Connection lifecycle is fully owned by the SSE registry.
      },
    });
  } catch (err) {
    if (!res.headersSent) {
      if (err instanceof AppError) {
        if (err.statusCode >= 500) {
          logger.error("Error opening score QR event stream", { err });
          res.status(500).json(buildErrorPayload("Internal server error"));
          return;
        }
        res.status(err.statusCode).json(buildErrorPayload(err.message));
        return;
      }

      logger.error("Error opening score QR event stream", { err });
      res.status(500).json(buildErrorPayload("Failed to open score QR event stream"));
    }
  }
}

export const cancelActiveScoreQr = async (
  req: Request,
  res: Response,
) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    await cancelActiveScoreQrFlow(authedReq.user!._id.toString());
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error cancelling active score QR session", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error cancelling active score QR session", { err });
    res.status(500).json(buildErrorPayload("Failed to cancel active score QR session"));
  }
};
