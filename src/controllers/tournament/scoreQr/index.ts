import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { AppError, buildErrorPayload } from "../../../shared/errors";
import { parseRouteObjectId, readRouteParam } from "../../../shared/validation";
import { authorizeScheduleOrMatchParticipant } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import {
  confirmScoreQrFlow,
  getActiveScoreQrSessionFlow,
  generateScoreQrFlow,
  validateScoreQrTokenFlow,
} from "./handler";
import {
  activeScoreQrQuerySchema,
  confirmScoreQrBodySchema,
  generateIndependentScoreQrBodySchema,
  generateScoreQrBodySchema,
  scoreQrTokenParamsSchema,
} from "./validation";

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
      const message = parsedBody.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json(buildErrorPayload(message));
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
      const message = parsedBody.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json(buildErrorPayload(message));
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
      const message = paramsResult.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const { token } = paramsResult.data;
    const validation = await validateScoreQrTokenFlow(token);

    if (!validation.valid || !validation.request) {
      const statusByReason: Record<string, number> = {
        expired: 410,
        request_expired: 410,
        request_not_found: 404,
        request_not_pending: 409,
        invalid_signature: 401,
        malformed: 400,
        request_match_mismatch: 409,
      };

      const messageByReason: Record<string, string> = {
        expired: "QR token has expired",
        request_expired: "QR request has expired",
        request_not_found: "QR request not found",
        request_not_pending: "QR request already consumed/cancelled",
        invalid_signature: "Invalid QR token signature",
        malformed: "Malformed QR token",
        request_match_mismatch: "QR token does not match persisted request",
      };

      const status = statusByReason[validation.reason] ?? 400;
      const message =
        messageByReason[validation.reason] ?? "QR token is invalid";

      res.status(status).json({
        ...buildErrorPayload(message),
        reason: validation.reason,
      });
      return;
    }

    res.status(200).json({
      message: "QR token is valid",
      valid: true,
      reason: validation.reason,
      request: validation.request,
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
 * POST /api/tournaments/score-qr/confirm
 * Confirms and persists score using a validated QR token (opponent flow).
 */
export async function confirmScoreQr(req: AuthenticatedRequest, res: Response) {
  try {
    const parsedBody = confirmScoreQrBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json(buildErrorPayload(message));
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
      const message = parsedQuery.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json(buildErrorPayload(message));
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
