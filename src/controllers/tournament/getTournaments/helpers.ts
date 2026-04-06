import type { TournamentFilter, ResolvedTournamentQuery } from "./validation";
import type { ListFilterContext } from "./authorize";
import { error, ok } from "../../../shared/helpers";
import { TournamentStatus } from "./validation";
import { escapeRegex } from "../../../lib/validation";

function intersectIds(
    base: string[] | null,
    incoming: string[]
  ): string[] {
    if (!base) return incoming;
    return base.filter((id) => incoming.includes(id));
  }
  
  function getTimeWindowFilter(
    when: "future" | "past"
  ): TournamentFilter {
    const now = new Date();
  
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
  
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
  
    const nowTime = `${String(now.getUTCHours()).padStart(
      2,
      "0"
    )}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  
    if (when === "future") {
      return {
        $or: [
          { date: { $gte: startOfTomorrow } },
          {
            date: { $gte: startOfToday, $lt: startOfTomorrow },
            $or: [
              { endTime: { $exists: false } },
              { endTime: "" },
              { endTime: null },
              { endTime: { $gte: nowTime } },
            ],
          },
        ],
      };
    }
  
    return {
      $or: [
        { date: { $lt: startOfToday } },
        {
          date: { $gte: startOfToday, $lt: startOfTomorrow },
          $nor: [
            { endTime: { $exists: false } },
            { endTime: "" },
            { endTime: null },
            { endTime: { $gte: nowTime } },
          ],
        },
      ],
    };
  }
  
  /**
   * Builds a Mongo filter from query + context.
   */
  export function buildTournamentFilter(
    query: ResolvedTournamentQuery,
    ctx: ListFilterContext
  ) {
    const filter: TournamentFilter = {};
    const isDraftsView = query.view === "drafts";
  
    let allowedClubIds: string[] | null = null;
  
    // --- ROLE BASE ---
    if (isDraftsView && !ctx.isSuperAdmin) {
      if (!ctx.isOrganiserOrAbove || !ctx.manageableClubIds.length) {
        return error(
          403,
          "You do not have access to these tournaments"
        );
      }
  
      allowedClubIds = [...ctx.manageableClubIds];
    }
  
    // --- STATUS ---
    filter.status = isDraftsView
      ? TournamentStatus.Draft
      : TournamentStatus.Active;
  
    if (isDraftsView) {
      filter.createdBy = ctx.requesterUserId
    }
  
    // --- CLUB ---
    if (query.club) {
      if (
        allowedClubIds &&
        !allowedClubIds.includes(query.club)
      ) {
        return error(
          403,
          "You do not have access to these tournaments"
        );
      }
  
      allowedClubIds = [query.club];
    }
  
    // --- DISTANCE --- (homeClubCoordinates when query.distance: validated in getTournamentsFlow)
    if (query.distance) {
      if (!query.distanceClubIds) {
        return error(
          400,
          "Distance filter not resolved"
        );
      }
  
      if (!query.distanceClubIds.length) {
        allowedClubIds = [];
      } else {
        allowedClubIds = intersectIds(
          allowedClubIds,
          query.distanceClubIds
        );
      }
    }
  
    // --- EARLY EXIT ---
    if (allowedClubIds && allowedClubIds.length === 0) {
      return ok({
        filter: { _id: { $in: [] } },
      });
    }
  
    // --- APPLY CLUB FILTER ---
    if (allowedClubIds) {
      filter.club = {
        $in: allowedClubIds,
      };
    }
  
    // --- WHEN ---
    if (query.when) {
      Object.assign(filter, getTimeWindowFilter(query.when));
    }
  
    // --- SEARCH ---
    if (query.q?.trim()) {
      filter.name = {
        $regex: escapeRegex(query.q.trim()),
        $options: "i",
      };
    }
  
    return ok({ filter });
  }