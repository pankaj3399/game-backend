import Sponsor from "../../../models/Sponsor";

/**
 * Fetches club sponsors for the given club.
 * Call only after authorization succeeds to avoid unnecessary DB work on 401/403.
 */
export function getClubSponsors(clubId: string) {
  return Sponsor.find({
    scope: "club",
    club: clubId,
    status: "active",
  })
    .select("name logoUrl link")
    .lean()
    .exec();
}
