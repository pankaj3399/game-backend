import Tournament from "../../../models/Tournament";
import { escapeRegex } from "../../../lib/validation";
import type { TournamentListDoc } from "../../../types/api/tournament";

import type { GetTournamentQuery } from "./validation";
import type { ListFilterContext } from "./authorize";
import { error, ok } from "../../../shared/helpers";

/**
 * Allowed status values for list filtering.
 */
const PUBLISHED_STATUSES = ["active", "inactive"] as const;

function isPublishedStatus(status: GetTournamentQuery["status"]){
  return status === "active" || status === "inactive";
}

/**
 * Builds the MongoDB filter for listing tournaments based on role and query.
 *
 * Rules:
 * - Super Admin: published view shows only active/inactive; drafts view shows drafts
 * - Organiser+: can see tournaments from clubs they manage
 * - Player: can only see active tournaments
 */
function buildTournamentFilter(
  query: GetTournamentQuery,
  ctx: ListFilterContext
) {
  const { status, q, view } = query;
  const { isOrganiserOrAbove, isSuperAdmin, manageableClubIds } = ctx;

  const filter: Record<string, any> = {};

  /**
   * ROLE-BASED FILTERING
   */
  if (!isSuperAdmin) {
    if (isOrganiserOrAbove) {
      if (!manageableClubIds.length) {
        return null;
      }

      filter.club = { $in: manageableClubIds };
    } else {
      // Player: only active tournaments
      filter.status = "active";
      return applySearchFilter(filter, q);
    }
  }

  /**
   * STATUS FILTERING
   */
  if (view === "drafts") {
    filter.status = "draft";
  } else {
    filter.status =
      status && isPublishedStatus(status)
        ? status
        : { $in: PUBLISHED_STATUSES };
  }

  return applySearchFilter(filter, q);
}

/**
 * Applies name search filtering.
 */
function applySearchFilter(
  filter: Record<string, any>,
  query?: string
) {
  if (!query?.trim()) {
    return filter;
  }

  filter.name = {
    $regex: escapeRegex(query.trim()),
    $options: "i",
  };

  return filter;
}

/**
 * Fetches tournaments using pagination and role-based filtering.
 */
export async function getTournamentsFlow(
  query: GetTournamentQuery,
  ctx: ListFilterContext
) {
  const { page, limit } = query;

  const filter = buildTournamentFilter(query, ctx);

  if (!filter) {
    return error(400, "No tournaments found");
  }

  const skip = (page - 1) * limit;

  const tournamentsQuery = Tournament.find(filter)
    .populate("club", "name")
    .populate("sponsor", "name logoUrl link")
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean<TournamentListDoc[]>()
    .exec();

  const countQuery = Tournament.countDocuments(filter);

  const [tournaments, total] = await Promise.all([
    tournamentsQuery,
    countQuery,
  ]);

  return ok({
    tournaments,
    total,
    page,
    limit,
  }, { status: 200, message: "Tournaments listed successfully" });
}