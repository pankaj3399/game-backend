import mongoose from "mongoose";
import Tournament from "../../../models/Tournament";
import Court from "../../../models/Court";
import { buildPublishCandidate } from "./helpers";
import type { TournamentPublishSource } from "../types/publish";
import { publishSchema, type PublishInput, type PublishBodyInput } from "./validation";
import { validateSponsorForPublish } from "./authorize";
import { checkCourtsBelongToClub } from "../../shared/relations";
import { error, ok } from "../../shared/helpers";

/**
 * Resolves courts for single-day publish when none selected (fallback to all club courts).
 */
async function resolveCourtsForSingleDay(
  clubId: string,
  publishCandidate: ReturnType<typeof buildPublishCandidate>
){
  const selectedCourts = publishCandidate.courts ?? [];
  if (selectedCourts.length > 0) {
    const courtCheck = await checkCourtsBelongToClub(clubId, selectedCourts);
    if (courtCheck.status !== 200) {
      return courtCheck;
    }
    return ok(
      { ...publishCandidate, status: "active" } as PublishInput,
      { status: 200, message: "Courts resolved" }
    );
  }

  const clubCourts = await Court.find({
    club: new mongoose.Types.ObjectId(clubId),
  })
    .select("_id")
    .lean()
    .exec();

  if (clubCourts.length === 0) {
    return error(
      400,
      "Selected club has no courts. Add at least one court before publishing this tournament."
    );
  }

  return ok(
    {
      ...publishCandidate,
      courts: clubCourts.map((court) => court._id.toString()),
      status: "active",
    } as PublishInput,
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
  const publishCandidate = buildPublishCandidate(tournament, validatedBody, clubId);
  let candidateForValidation;

  if (publishCandidate.tournamentMode === "singleDay") {
    const resolved = await resolveCourtsForSingleDay(clubId, publishCandidate);
    if (resolved.status !== 200) {
      return resolved;
    }
    candidateForValidation = resolved.data;
  } else {
    candidateForValidation = { ...publishCandidate, status: "active" };
  }

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
  const updated = await Tournament.findByIdAndUpdate(
    tournamentId,
    { $set: payload },
    { new: true, runValidators: true }
  )
    .select("_id name club status")
    .lean()
    .exec();

  if (!updated) {
    return error(404, "Tournament not found");
  }

  return ok(
    {
      id: updated._id.toString(),
      name: updated.name,
      club: updated.club.toString(),
      status: "active" as const,
    },
    { status: 200, message: "Tournament published" }
  );
}
