import Tournament from "../../../models/Tournament";
import Sponsor from "../../../models/Sponsor";
import type { TournamentPopulated } from "../../../types/api/tournament";

/**
 * Fetches a tournament by ID with populated relations.
 * Use this for authorization; fetch club sponsors only after authorize succeeds.
 */
export async function fetchTournamentById(
  id: string
) {
  return await Tournament.findById(id)
    .populate("club", "name")
    .populate("sponsorId", "name logoUrl link")
    .populate("courts", "name type placement")
    .populate("participants", "name alias")
    .lean<TournamentPopulated>()
    .exec();
}

/**
 * Fetches club sponsors for the given club.
 * Call only after authorization succeeds to avoid unnecessary DB work on 401/403.
 */
export async function getClubSponsors(clubId: string) {
  return await Sponsor.find({
    scope: "club",
    clubId,
    status: "active",
  })
    .select("name logoUrl link")
    .lean()
    .exec();
}
