import type { UpdateDraftInput } from "./validation";
import {
  checkClubExists,
  checkClubManagement,
  checkSponsorBelongsToClub,
} from "../../../shared/relations";
import { isOwnerOrSuperAdmin } from "../../../lib/permissions";
import {
  buildPermissionContext,
  type AuthenticatedSession,
} from "../../../shared/authContext";
import type { TournamentForUpdateAuth } from "../../../types/api";
import { error, ok } from "../../../shared/helpers";

export interface UpdateContext {
  clubId: string;
  clubChanged: boolean;
}

/**
 * Authorizes and validates update for existing tournaments with club/sponsor integrity.
 */
export async function authorizeUpdate(
  tournament: TournamentForUpdateAuth,
  data: UpdateDraftInput,
  session: AuthenticatedSession
){
  const currentClubId = tournament.club.toString();
  if (!isOwnerOrSuperAdmin(session, tournament.createdBy)) {
    return error(403, "You do not have permission to update this tournament");
  }

  const targetClubId = data.club ?? currentClubId;
  const clubChanged = targetClubId !== currentClubId;

  if (clubChanged) {
    const ctx = buildPermissionContext(session);
    const manageResult = await checkClubManagement(
      ctx,
      targetClubId,
      "You do not have permission to move this tournament to the selected club"
    );
    if (manageResult.status !== 200) {
      return manageResult;
    }
  }

  const clubResult = await checkClubExists(targetClubId);
  if (clubResult.status !== 200) {
    return clubResult;
  }

  if (data.sponsor) {
    const sponsorResult = await checkSponsorBelongsToClub(data.sponsor.toString(), targetClubId);
    if (sponsorResult.status !== 200) {
      return sponsorResult;
    }
  }

  const effectiveMinMember =
    data.minMember !== undefined ? data.minMember : tournament.minMember;
  const effectiveMaxMember =
    data.maxMember !== undefined ? data.maxMember : tournament.maxMember;
  if (
    effectiveMinMember != null &&
    effectiveMaxMember != null &&
    effectiveMaxMember < effectiveMinMember
  ) {
    return error(400, "maxMember must be greater than or equal to minMember");
  }

  return ok({ clubId: targetClubId, clubChanged }, { status: 200, message: "Authorized" });
}
