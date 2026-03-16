import type { CreateTournamentInput } from "./validation";
import {
  buildPermissionContext,
  type AuthenticatedSession,
} from "../../../shared/authContext";

export type { AuthenticatedSession };
import {
  checkClubManagement,
  checkClubExists,
  checkSponsorBelongsToClub,
} from "../../../shared/relations";
import { error, ok } from "../../../shared/helpers";


/**
 * Verifies the user can create a tournament for the given club and that
 * sponsor (if any) belongs to that club. Returns an error result for 403/404/400.
 * Caller must ensure session is authenticated (e.g. index checks !session?._id).
 */
export async function authorizeCreate(
  data: CreateTournamentInput,
  session: AuthenticatedSession
) {
  const clubId = data.club;
  if (!clubId) {
    return error(400, "Club is required");
  }

  const ctx = buildPermissionContext(session);
  const manageResult = await checkClubManagement(
    ctx,
    clubId,
    "You do not have permission to create tournaments for this club"
  );
  if (manageResult.status !== 200) {
    return manageResult;
  }

  const clubResult = await checkClubExists(clubId);
  if (clubResult.status !== 200) {
    return clubResult;
  }

  if (data.sponsorId != null && data.sponsorId !== "") {
    const sponsorResult = await checkSponsorBelongsToClub(data.sponsorId, clubId);
    if (sponsorResult.status !== 200) {
      return sponsorResult;
    }
  }

  return ok({ context: { clubId } }, { status: 200, message: "Authorized" });
}
