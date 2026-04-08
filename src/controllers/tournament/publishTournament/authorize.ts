import { checkSponsorBelongsToClub } from "../../../shared/relations";
import type { AuthenticatedSession } from "../../../shared/authContext";
import { isOwnerOrSuperAdmin } from "../../../lib/permissions";
import type { TournamentPublishSource } from "../../../types/api";
import type { PublishInput } from "./validation";
import { error, ok } from "../../../shared/helpers";

/**
 * Authorizes publish via publish endpoint: draft only, creator/super-admin.
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

  if (!isOwnerOrSuperAdmin(session, tournament.createdBy)) {
    return error(403, "You do not have permission to publish this tournament");
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
