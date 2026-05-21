import { getZonedDateParts } from "../../../shared/timezone";
import { DEFAULT_SCHEDULE_START_TIME } from "./constants";

export type ScheduleGameTiming = {
  round: number;
  startTime: Date | null | undefined;
  endTime?: Date | null | undefined;
  detachedFromRound?: number | null;
};

function normalizeTime24(value: string | null | undefined): string | null {
  if (!value || !/^\d{1,2}:\d{1,2}$/.test(value.trim())) {
    return null;
  }
  const [hoursText, minutesText] = value.trim().split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTime24InTimeZone(instant: Date, timeZone: string): string {
  const parts = getZonedDateParts(instant, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function resolveGameEndMs(
  game: ScheduleGameTiming,
  matchDurationMinutes: number
): number | null {
  if (game.endTime instanceof Date && Number.isFinite(game.endTime.getTime())) {
    return game.endTime.getTime();
  }
  if (!(game.startTime instanceof Date) || !Number.isFinite(game.startTime.getTime())) {
    return null;
  }
  const durationMs = Math.max(1, matchDurationMinutes) * 60_000;
  return game.startTime.getTime() + durationMs;
}

export function resolveDefaultScheduleStartTime(params: {
  targetRound: number;
  tournamentStartTime: string | null | undefined;
  matchDurationMinutes: number;
  games: readonly ScheduleGameTiming[];
  timeZone: string;
  now?: Date;
}): string {
  const tournamentStart =
    normalizeTime24(params.tournamentStartTime) ?? DEFAULT_SCHEDULE_START_TIME;

  if (params.targetRound <= 1) {
    return tournamentStart;
  }

  const now = params.now ?? new Date();
  let latestEndMs: number | null = null;

  for (const game of params.games) {
    if (game.detachedFromRound != null) {
      continue;
    }
    if (game.round >= params.targetRound) {
      continue;
    }

    const endMs = resolveGameEndMs(game, params.matchDurationMinutes);
    if (endMs == null) {
      continue;
    }
    latestEndMs = latestEndMs == null ? endMs : Math.max(latestEndMs, endMs);
  }

  const anchorMs = Math.max(latestEndMs ?? now.getTime(), now.getTime());
  return formatTime24InTimeZone(new Date(anchorMs), params.timeZone);
}
