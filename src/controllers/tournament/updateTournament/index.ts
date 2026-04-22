import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest, type AuthenticatedSession } from "../../../shared/authContext";
import { updateDraftSchema, type UpdateDraftInput } from "./validation";
import { authorizeUpdate } from "./authorize";
import { fetchTournamentForUpdate } from "./queries";
import { updateTournamentFlow } from "./handler";
import { computeEffectiveSponsor } from "./computeEffectiveSponsor";
import { validateActiveTournamentEnrolledUpdate } from "./activeEnrolledUpdate";
import { validateScheduleActivationEnrollment } from "./scheduleActivationEnrollment";
import { publishSchema } from "../../../validation/tournament.schemas";
import {
  resolveTournamentTimezoneFromClub,
  TournamentTimezoneResolutionError,
} from "../shared/resolveTournamentTimezone";

function normalizePublishCandidateWithValidation(publishCandidate: Record<string, unknown>) {
  const publishValidation = publishSchema.safeParse(publishCandidate);
  if (!publishValidation.success) {
    const message = publishValidation.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`publish validation failed: ${message || "Tournament publish validation failed"}`);
  }

  return {
    ...publishValidation.data,
    duration: publishValidation.data.duration ?? 60,
    breakDuration: publishValidation.data.breakDuration ?? 0,
  };
}

/**
 * PATCH /api/tournaments/:id
 * Update tournament. Existing draft and published tournaments can be updated.
 */
export async function updateTournament(req: AuthenticatedRequest ,res: Response){
  try {

    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const bodyParse = updateDraftSchema.safeParse(req.body);
    if (!bodyParse.success) {
      const message = bodyParse.error.issues.map((i) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentForUpdate(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }
    if (tournament.status !== 200) {
      res.status(tournament.status).json(buildErrorPayload(tournament.message));
      return;
    }

    const authResult = await authorizeUpdate(tournament.data, bodyParse.data, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const timezoneImpliedByUpdateFields =
      authResult.data.clubChanged ||
      bodyParse.data.date !== undefined ||
      bodyParse.data.startTime !== undefined ||
      bodyParse.data.endTime !== undefined ||
      bodyParse.data.tournamentMode !== undefined;

    const shouldApplyResolvedTimezone =
      bodyParse.data.timezone !== undefined || timezoneImpliedByUpdateFields;

    const resolvedTournamentTimezone = shouldApplyResolvedTimezone
      ? await resolveTournamentTimezoneFromClub(authResult.data.clubId)
      : undefined;

    const dataWithResolvedTimezone: UpdateDraftInput =
      resolvedTournamentTimezone !== undefined
        ? {
            ...bodyParse.data,
            timezone: resolvedTournamentTimezone,
          }
        : {
            ...bodyParse.data,
          };

    const enrolledGuard = validateActiveTournamentEnrolledUpdate(
      tournament.data,
      bodyParse.data
    );
    if (!enrolledGuard.ok) {
      res.status(enrolledGuard.status).json(buildErrorPayload(enrolledGuard.message));
      return;
    }

    const scheduleEnrollmentGuard = validateScheduleActivationEnrollment(
      tournament.data,
      dataWithResolvedTimezone
    );
    if (!scheduleEnrollmentGuard.ok) {
      res
        .status(scheduleEnrollmentGuard.status)
        .json(buildErrorPayload(scheduleEnrollmentGuard.message));
      return;
    }

    const nextStatus = dataWithResolvedTimezone.status ?? tournament.data.status;
    let publishUpdatePayload: UpdateDraftInput | null = null;
    if (nextStatus === "active") {
      const clubId = authResult.data.clubId;
      const d = dataWithResolvedTimezone;
      const t = tournament.data;
      const effectiveSponsor = computeEffectiveSponsor(
        authResult.data.clubChanged,
        d.sponsor,
        t.sponsor ?? null
      );

      const publishCandidate = {
        club: clubId,
        sponsor: effectiveSponsor,
        name: d.name !== undefined ? d.name : t.name,
        date: d.date !== undefined ? d.date : t.date ?? null,
        startTime:
          d.startTime !== undefined ? d.startTime : t.startTime ?? null,
        endTime: d.endTime !== undefined ? d.endTime : t.endTime ?? null,
        timezone:
          resolvedTournamentTimezone ??
          (d.timezone !== undefined ? d.timezone : t.timezone ?? null),
        playMode:
          d.playMode !== undefined ? d.playMode : t.playMode,
        tournamentMode:
          d.tournamentMode !== undefined ? d.tournamentMode : t.tournamentMode,
        entryFee: d.entryFee !== undefined ? d.entryFee : t.entryFee,
        minMember: d.minMember !== undefined ? d.minMember : t.minMember,
        maxMember: d.maxMember !== undefined ? d.maxMember : t.maxMember,
        totalRounds: d.totalRounds !== undefined ? d.totalRounds : t.totalRounds,
        duration:
          d.duration !== undefined ? d.duration : t.duration ?? null,
        breakDuration:
          d.breakDuration !== undefined
            ? d.breakDuration
            : t.breakDuration ?? null,
        foodInfo:
          d.foodInfo !== undefined ? d.foodInfo : t.foodInfo ?? "",
        descriptionInfo:
          d.descriptionInfo !== undefined
            ? d.descriptionInfo
            : t.descriptionInfo ?? "",
        status: "active" as const,
      };

      // Skip strict publish validation only when no rounds are provided/stored and this is not draft->active.
      const needsPublishValidation =
        d.totalRounds !== undefined ||
        t.totalRounds !== undefined ||
        (t.status !== "active" && publishCandidate.status === "active");

      const normalizedPublishCandidate = needsPublishValidation
        ? normalizePublishCandidateWithValidation(publishCandidate)
        : {
            ...publishCandidate,
            duration: publishCandidate.duration ?? 60,
            breakDuration: publishCandidate.breakDuration ?? 0,
          };

      publishUpdatePayload = {
        ...dataWithResolvedTimezone,
        ...normalizedPublishCandidate,
      };
    }

    const effectiveUpdatePayload: UpdateDraftInput = {
      ...dataWithResolvedTimezone,
    };

    const result = await updateTournamentFlow(
      idResult.data,
      publishUpdatePayload ?? effectiveUpdatePayload,
      {
        clubChanged: authResult.data.clubChanged,
      }
    );
    if (!result || !result.ok) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    res.status(200).json({
      message: "Tournament updated",
      tournament: result.tournament,
    });
  } catch (err: unknown) {
    if (err instanceof TournamentTimezoneResolutionError) {
      res.status(400).json(buildErrorPayload(err.message));
      return;
    }
    if (err instanceof Error) {
      if (err.message.startsWith("publish validation failed:")) {
        res.status(400).json(buildErrorPayload(err.message));
        return;
      }
      if (err.message.includes("Selected club has no courts")) {
        res.status(400).json(buildErrorPayload(err.message));
        return;
      }
    }

    const mongoErr = err as { code?: number; keyPattern?: Record<string, number> };
    if (mongoErr?.code === 11000) {
      if (mongoErr.keyPattern?.club === 1 && mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists in the selected club"));
        return;
      }
      if (mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists"));
        return;
      }
      res.status(409).json(buildErrorPayload("A tournament with the same unique data already exists"));
      return;
    }

    logger.error("Error updating tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
