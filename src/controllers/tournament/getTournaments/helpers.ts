import type { TournamentFilter, ResolvedTournamentQuery } from "./validation";
import type { ListFilterContext } from "./authorize";
import { error, ok } from "../../../shared/helpers";
import { TournamentStatus } from "./validation";
import { escapeRegex } from "../../../lib/validation";
import {
  getZonedDateParts,
  getCurrentTimeInTimeZone,
  getStartOfTodayInTimeZoneUtc,
  resolveTournamentTimeZone,
  zonedDateTimeToUtcDate,
} from "../../../shared/timezone";

function intersectIds(
    base: string[] | null,
    incoming: string[]
  ): string[] {
    if (!base) return incoming;
    return base.filter((id) => incoming.includes(id));
  }
  
  function getTimeWindowFilter(
    when: "future" | "past",
    timezone?: string
  ): TournamentFilter {
    const resolvedTimeZone = resolveTournamentTimeZone(timezone);
    const startOfToday = getStartOfTodayInTimeZoneUtc(resolvedTimeZone);
    const todayParts = getZonedDateParts(startOfToday, resolvedTimeZone);
    const startOfTomorrow = zonedDateTimeToUtcDate(
      {
        year: todayParts.year,
        month: todayParts.month,
        day: todayParts.day + 1,
        hour: 0,
        minute: 0,
        second: 0,
      },
      resolvedTimeZone
    );
    const nowTime = getCurrentTimeInTimeZone(resolvedTimeZone);
  
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
      const timeWindow = getTimeWindowFilter(query.when, query.timezone);
      const timeBranches =
        "$or" in timeWindow && Array.isArray(timeWindow.$or)
          ? timeWindow.$or
          : [timeWindow];
      filter.$or = [...timeBranches, { tournamentMode: "unscheduled" }];
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