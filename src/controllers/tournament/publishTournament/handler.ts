
import { buildPublishCandidate } from "./helpers";
import type { TournamentPublishSource } from "../../../types/api";
import { publishSchema, type PublishBodyInput } from "./validation";
import { validateSponsorForPublish } from "./authorize";
import { error, ok } from "../../../shared/helpers";
import { fetchClubCourtIdsForPublish, updateTournamentForPublish } from "./queries";

/**
 * Resolves courts for publish from all courts belonging to the selected club.
 */
async function resolveCourtsForPublish(
  clubId: string,
  publishCandidate: ReturnType<typeof buildPublishCandidate>
){
  const clubCourtsResult = await fetchClubCourtIdsForPublish(clubId);
  if (clubCourtsResult.status !== 200) {
    return clubCourtsResult;
  }

  if (clubCourtsResult.data.length === 0) {
    return error(
      400,
      "Selected club has no courts. Add at least one court before publishing this tournament."
    );
  }

  return ok(
    {
      ...publishCandidate,
      courts: clubCourtsResult.data,
      status: "active",
    },
    { status: 200, message: "Courts resolved" }
  );
}

/**
 * Orchestrates the publish flow: build candidate, resolve courts if needed, persist.
 */
export async function publishTournamentFlow(
  tournamentId: string,
  tournament: TournamentPublishSource,
  validatedBody: PublishBodyInput,
  clubId: string
) {
  const publishCandidate = buildPublishCandidate(
    tournament,
    validatedBody,
    clubId
  );
  const resolved = await resolveCourtsForPublish(clubId, publishCandidate);
  if (resolved.status !== 200) {
    return resolved;
  }
  const candidateForValidation = resolved.data;

  const parsed = publishSchema.safeParse(candidateForValidation);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return error(400, message || "Tournament publish validation failed");
  }
  const data = parsed.data;

  const sponsorCheck = await validateSponsorForPublish(data, clubId);
  if (sponsorCheck.status !== 200) {
    return sponsorCheck;
  }

  const { sponsor, ...restPayload } = data;
  const payload = {
    ...restPayload,
    sponsor: sponsor ?? null,
    status: "active" as const,
  };
  const updatedResult = await updateTournamentForPublish(tournamentId, payload);
  if (updatedResult.status !== 200) {
    return updatedResult;
  }

  return ok(updatedResult.data, { status: 200, message: "Tournament published" });
}
