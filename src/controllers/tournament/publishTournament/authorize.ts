import { checkClubManagement, checkSponsorBelongsToClub } from "../../shared/relations";
import { buildPermissionContext, type AuthenticatedSession } from "../../shared/authContext";
import type { TournamentPublishSource } from "../types/publish";
import type { PublishInput } from "./validation";
import { error, ok } from "../../shared/helpers";

/**
 * Authorizes publish: draft-only, club permission.
 * Caller must handle idempotent (already active) case before calling.
 */
export async function authorizePublish(
  tournament: TournamentPublishSource,
  session: AuthenticatedSession
){
  if (tournament.status !== "draft") {
    return error(400, "Only draft tournaments can be published");
  }

  const clubId = tournament.club?.toString();
  if (!clubId) {
    return error(400, "Tournament has no club");
  }

  const ctx = buildPermissionContext(session);
  const manageResult = await checkClubManagement(
    ctx,
    clubId,
    "You do not have permission to publish this tournament"
  );
  if (manageResult.status !== 200) {
    return manageResult;
  }

  return ok({ clubId }, { status: 200, message: "Authorized" });
}

/**
 * Validates sponsor belongs to club after full publish candidate is built.
 */
export async function validateSponsorForPublish(
  data: PublishInput,
  clubId: string
){
  if (data.sponsor) {
    const sponsorResult = await checkSponsorBelongsToClub(data.sponsor, clubId);
    if (sponsorResult.status !== 200) {
      return sponsorResult;
    }
  }
  return ok({}, { status: 200, message: "Sponsor valid" });
}
