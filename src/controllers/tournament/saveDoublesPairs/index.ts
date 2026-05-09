import { z } from "zod";
import type { Response } from "express";
import Tournament from "../../../models/Tournament";
import { logger } from "../../../lib/logger";
import { AuthenticatedRequest, buildPermissionContext } from "../../../shared/authContext";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload, buildZodErrorPayload } from "../../../shared/errors";
import { userCanManageClub } from "../../../lib/permissions";
import { ROLES } from "../../../constants/roles";
import { authorizeGetById } from "../shared/authorizeGetById";
import { fetchTournamentById } from "../shared/fetchTournamentById";
import { sanitizeDoublesPairs, toDoublesPairsObject } from "../shared/doublesPairs";

const saveDoublesPairsSchema = z.object({
  doublesPairs: z.record(z.string(), z.string()).default({}),
});

function applyParticipantSelfPairing(
  currentPairs: Record<string, string>,
  requestedPairs: Record<string, string>,
  participantId: string
) {
  const next = { ...currentPairs };

  const existingPartner = next[participantId];
  if (existingPartner) {
    delete next[participantId];
    delete next[existingPartner];
  }

  const requestedPartnerId = requestedPairs[participantId];
  if (!requestedPartnerId) {
    return { ok: true as const, pairs: next };
  }

  const requestedPartnerCurrent = next[requestedPartnerId];
  if (requestedPartnerCurrent && requestedPartnerCurrent !== participantId) {
    return {
      ok: false as const,
      status: 409,
      message: "Selected partner is already paired with another participant",
    };
  }

  next[participantId] = requestedPartnerId;
  next[requestedPartnerId] = participantId;
  return { ok: true as const, pairs: next };
}

function buildRequestedPairs(
  value: unknown,
  participantIds: string[]
): Record<string, string> {
  const rawPairs = toDoublesPairsObject(value);
  const validIds = new Set(participantIds);
  const next: Record<string, string> = {};

  for (const participantId of participantIds) {
    const partnerRaw = rawPairs[participantId];
    if (typeof partnerRaw !== "string") {
      continue;
    }
    const partnerId = partnerRaw.trim();
    if (!partnerId || partnerId === participantId || !validIds.has(partnerId)) {
      continue;
    }
    next[participantId] = partnerId;
  }

  return next;
}

/**
 * PUT /api/tournaments/:id/doubles-pairs
 * - Organisers can set/clear any pair map.
 * - Participants can only set/clear their own self↔partner pair.
 */
export async function saveDoublesPairs(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const parsedBody = saveDoublesPairsSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json(buildZodErrorPayload(parsedBody.error));
      return;
    }

    const tournament = await fetchTournamentById(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeGetById(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const clubId = authResult.data.context.clubIdStr;
    if (!clubId) {
      res.status(400).json(buildErrorPayload("Tournament has no club"));
      return;
    }

    const sessionUserId = req.user._id.toString();

    const isManager = await userCanManageClub(buildPermissionContext(req.user), clubId);
    const isCreator = tournament.createdBy.equals(req.user._id);
    const isOrganiser = req.user.role === ROLES.SUPER_ADMIN || isCreator || isManager;

    const MAX_WRITE_RETRIES = 3;
    let updatedTournament:
      | {
          participants?: Array<{ _id: { toString(): string } }>;
          doublesPairs?: unknown;
        }
      | null = null;
    let lastWriteConflict = false;

    for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt += 1) {
      const snapshot = await Tournament.findById(idResult.data)
        .select("participants doublesPairs __v")
        .lean<{
          participants?: Array<{ _id: { toString(): string } }>;
          doublesPairs?: unknown;
          __v?: number;
        }>()
        .exec();

      if (!snapshot) {
        res.status(404).json(buildErrorPayload("Tournament not found"));
        return;
      }

      const participantIds = (snapshot.participants ?? []).map((participant) => participant._id.toString());
      const participantSet = new Set(participantIds);
      const requestedPairs = buildRequestedPairs(parsedBody.data.doublesPairs, participantIds);
      const currentPairs = sanitizeDoublesPairs(snapshot.doublesPairs, participantIds);

      let nextPairs: Record<string, string>;
      if (isOrganiser) {
        nextPairs = requestedPairs;
      } else {
        if (!participantSet.has(sessionUserId)) {
          res.status(403).json(buildErrorPayload("Only participants can set doubles pairing"));
          return;
        }

        const participantUpdate = applyParticipantSelfPairing(
          currentPairs,
          requestedPairs,
          sessionUserId
        );
        if (!participantUpdate.ok) {
          res.status(participantUpdate.status).json(buildErrorPayload(participantUpdate.message));
          return;
        }
        nextPairs = participantUpdate.pairs;
      }

      const sanitizedNextPairs = sanitizeDoublesPairs(nextPairs, participantIds);
      updatedTournament = await Tournament.findOneAndUpdate(
        { _id: idResult.data, __v: snapshot.__v ?? 0 },
        {
          $set: { doublesPairs: sanitizedNextPairs },
          $inc: { __v: 1 },
        },
        { returnDocument: "after", runValidators: true }
      )
        .select("participants doublesPairs")
        .lean<{
          participants?: Array<{ _id: { toString(): string } }>;
          doublesPairs?: unknown;
        }>()
        .exec();

      if (updatedTournament) {
        break;
      }

      lastWriteConflict = true;
    }

    if (!updatedTournament) {
      const message = lastWriteConflict
        ? "Doubles pairs were updated by another request. Please retry."
        : "Tournament not found";
      res.status(lastWriteConflict ? 409 : 404).json(buildErrorPayload(message));
      return;
    }

    const updatedParticipantIds = (updatedTournament.participants ?? []).map((participant) =>
      participant._id.toString()
    );
    const doublesPairs = sanitizeDoublesPairs(updatedTournament.doublesPairs, updatedParticipantIds);

    res.status(200).json({
      message: "Doubles pairs saved",
      doublesPairs,
    });
  } catch (err: unknown) {
    logger.error("Error saving doubles pairs", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
