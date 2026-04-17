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
    .populate({
      path: "club",
      select: "name address",
      populate: {
        path: "courts",
        select: "name type placement",
      },
    })
    .populate({
      path: "schedule",
      select: "currentRound rounds.round",
    })
    .populate("sponsor", "name logoUrl link")
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
    club: clubId,
    status: "active",
  })
    .select("name logoUrl link")
    .lean()
    .exec();
}
