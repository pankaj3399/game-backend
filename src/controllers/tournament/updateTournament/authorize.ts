import type { UpdateDraftInput } from "./validation";
import {
  checkClubExists,
  checkSponsorBelongsToClub,
  checkCourtsBelongToClub,
} from "../../../shared/relations";
import { isOwnerOrSuperAdmin } from "../../../lib/permissions";
import type { AuthenticatedSession } from "../../../shared/authContext";
import type { TournamentForUpdateAuth } from "../../../types/api";
import { error, ok } from "../../../shared/helpers";

export interface UpdateContext {
  clubId: string;
  updateClubId: string;
  isChangingClub: boolean;
}

/**
 * Authorizes and validates update: draft-only, creator/super-admin, club/sponsor/court integrity.
 */
export async function authorizeUpdate(
  tournament: TournamentForUpdateAuth,
  data: UpdateDraftInput,
  session: AuthenticatedSession
){
  if (tournament.status !== "draft") {
    return error(400, "Only draft tournaments can be updated. Use publish to activate.");
  }

  const clubId = tournament.club.toString();
  if (!isOwnerOrSuperAdmin(session, tournament.createdBy)) {
    return error(403, "You do not have permission to update this tournament");
  }

  const updateClubId = data.club ?? clubId;
  const isChangingClub = Boolean(data.club && data.club !== clubId);

  if (isChangingClub) {
    return error(400, "club cannot be changed for an existing tournament");
  }

  const clubResult = await checkClubExists(updateClubId);
  if (clubResult.status !== 200) {
    return clubResult;
  }

  if (data.sponsor) {
    const sponsorResult = await checkSponsorBelongsToClub(data.sponsor.toString(), updateClubId);
    if (sponsorResult.status !== 200) {
      return sponsorResult;
    }
  }

  if (Array.isArray(data.courts) && data.courts.length > 0) {
    const courtResult = await checkCourtsBelongToClub(updateClubId, data.courts);
    if (courtResult.status !== 200) {
      return courtResult;
    }
  }

  if ("status" in data && data.status !== undefined) {
    return error(400, "status cannot be set via update; use publish to activate");
  }

  const effectiveMinMember = data.minMember ?? tournament.minMember;
  const effectiveMaxMember = data.maxMember ?? tournament.maxMember;
  if (
    effectiveMinMember != null &&
    effectiveMaxMember != null &&
    effectiveMaxMember < effectiveMinMember
  ) {
    return error(400, "maxMember must be greater than or equal to minMember");
  }

  return ok({ clubId, updateClubId, isChangingClub }, { status: 200, message: "Authorized" });
}
