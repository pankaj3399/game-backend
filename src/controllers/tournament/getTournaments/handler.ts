import Tournament from "../../../models/Tournament";
import type { TournamentListDoc } from "../../../types/api/tournament";
import { buildTournamentFilter } from "./helpers";
import type { GetTournamentQuery,} from "./validation";
import type { ListFilterContext } from "./authorize";
import { error, ok } from "../../../shared/helpers";
import { findClubIdsForDistanceBand } from "./distanceService";



/**
 * Fetches tournaments using pagination and role-based filtering.
 */
export async function getTournamentsFlow(
  query: GetTournamentQuery,
  ctx: ListFilterContext
) {
  const { page, limit } = query;

  let distanceClubIds: string[] | undefined;

  if (query.distance) {
    if (!ctx.homeClubCoordinates) {
      return error(
        400,
        "A home club is required for distance filtering"
      );
    }

    distanceClubIds =
      await findClubIdsForDistanceBand(
        ctx.homeClubCoordinates,
        query.distance
      );
  }

  const filterResult = buildTournamentFilter(
    {
      ...query,
      distanceClubIds,
    },
    ctx
  );

  if (!filterResult.ok) return filterResult;

  const { filter } = filterResult.data;

  const skip = (page - 1) * limit;

  const [tournaments, total] = await Promise.all([
    Tournament.find(filter)
      .populate("club", "name logoUrl")
      .populate("sponsor", "name logoUrl link")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<TournamentListDoc[]>()
      .exec(),

    Tournament.countDocuments(filter).exec(),
  ]);

  return ok(
    { tournaments, total, page, limit },
    {
      status: 200,
      message: "Tournaments listed successfully",
    }
  );
}