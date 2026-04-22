import type { TournamentForUpdateAuth } from "../../../types/api";
import { error, ok } from "../../../shared/helpers";
import type { UpdateDraftInput } from "./validation";
import {
  DEFAULT_TOURNAMENT_TIMEZONE,
  isValidIanaTimeZone,
  resolveTournamentTimeZone,
} from "../../../shared/timezone";

const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(s: string) {
  return timeRegex.test(s);
}

function isFullyScheduledSingleDay(t: {
  tournamentMode?: string | null;
  date?: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}): boolean {
  if (t.tournamentMode !== "singleDay") return false;
  if (t.date == null) return false;
  const st = t.startTime;
  const et = t.endTime;
  if (st == null || st === "" || !isValidTime(st)) return false;
  if (et == null || et === "" || !isValidTime(et)) return false;
  if (t.timezone != null && t.timezone !== "" && !isValidIanaTimeZone(t.timezone)) return false;
  const resolvedTimezone = resolveTournamentTimeZone(t.timezone, DEFAULT_TOURNAMENT_TIMEZONE);
  if (!isValidIanaTimeZone(resolvedTimezone)) return false;
  const toMin = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(st) < toMin(et);
}

function currentScheduleFields(tournament: TournamentForUpdateAuth) {
  return {
    tournamentMode: tournament.tournamentMode,
    date: tournament.date ?? null,
    startTime: tournament.startTime ?? null,
    endTime: tournament.endTime ?? null,
    timezone: resolveTournamentTimeZone(
      tournament.timezone ?? null,
      DEFAULT_TOURNAMENT_TIMEZONE
    ),
  };
}

function mergeEffectiveSchedule(
  tournament: TournamentForUpdateAuth,
  data: UpdateDraftInput
) {
  return {
    tournamentMode:
      data.tournamentMode !== undefined
        ? data.tournamentMode
        : tournament.tournamentMode,
    date: data.date !== undefined ? data.date : tournament.date ?? null,
    startTime:
      data.startTime !== undefined ? data.startTime : tournament.startTime ?? null,
    endTime:
      data.endTime !== undefined ? data.endTime : tournament.endTime ?? null,
    timezone:
      resolveTournamentTimeZone(
        data.timezone !== undefined ? data.timezone : tournament.timezone ?? null,
        DEFAULT_TOURNAMENT_TIMEZONE
      ),
  };
}

/**
 * When a tournament ends up active with a full single-day schedule for the first
 * time and there are already registrants, require enrollment to meet minMember.
 * Lets organizers raise minMember during edit; blocks committing a schedule until
 * enough players have joined.
 */
export function validateScheduleActivationEnrollment(
  tournament: TournamentForUpdateAuth,
  data: UpdateDraftInput
) {
  const nextStatus =
    data.status !== undefined ? data.status : tournament.status;

  if (nextStatus !== "active") {
    return ok(undefined, { status: 200, message: "OK" });
  }

  const enrolledCount = (tournament.participants ?? []).length;
  if (enrolledCount === 0) {
    return ok(undefined, { status: 200, message: "OK" });
  }

  const before = currentScheduleFields(tournament);
  const after = mergeEffectiveSchedule(tournament, data);

  const wasScheduled = isFullyScheduledSingleDay(before);
  const willBeScheduled = isFullyScheduledSingleDay(after);

  if (wasScheduled === willBeScheduled) {
    return ok(undefined, { status: 200, message: "OK" });
  }

  if (!wasScheduled && willBeScheduled) {
    const effectiveMin =
      data.minMember !== undefined ? data.minMember : tournament.minMember ?? 1;

    if (effectiveMin != null && enrolledCount < effectiveMin) {
      return error(
        400,
        `At least ${effectiveMin} registered participants are required to schedule this tournament (currently ${enrolledCount})`
      );
    }
  }

  return ok(undefined, { status: 200, message: "OK" });
}
