export const DEFAULT_TOURNAMENT_TIMEZONE = "UTC";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidIanaTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  const offsetPattern =
    /^(?:[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?|UTC[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)$/i;
  if (offsetPattern.test(value.trim())) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTournamentTimeZone(
  value: string | null | undefined,
  fallback: string = DEFAULT_TOURNAMENT_TIMEZONE
): string {
  if (isValidIanaTimeZone(value)) {
    return value;
  }

  return isValidIanaTimeZone(fallback)
    ? fallback
    : DEFAULT_TOURNAMENT_TIMEZONE;
}

export function getZonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(instant);
  const values = new Map<string, string>();
  for (const part of parts) {
    values.set(part.type, part.value);
  }

  const year = Number.parseInt(values.get("year") ?? "", 10);
  const month = Number.parseInt(values.get("month") ?? "", 10);
  const day = Number.parseInt(values.get("day") ?? "", 10);
  const hour = Number.parseInt(values.get("hour") ?? "", 10);
  const minute = Number.parseInt(values.get("minute") ?? "", 10);
  const second = Number.parseInt(values.get("second") ?? "", 10);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    throw new Error(`Failed to resolve timezone parts for ${timeZone}`);
  }

  return { year, month, day, hour, minute, second };
}

export function getCurrentTimeInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = getZonedDateParts(now, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function zonedDateTimeToUtcDate(
  input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string
): Date {
  const requestedWallTime = `${input.year}-${String(input.month).padStart(2, "0")}-${String(
    input.day
  ).padStart(2, "0")} ${String(input.hour).padStart(2, "0")}:${String(input.minute).padStart(
    2,
    "0"
  )}:${String(input.second ?? 0).padStart(2, "0")}`;
  const targetMs = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
    0
  );

  let guessMs = targetMs;
  let lastDelta = Number.NaN;
  for (let i = 0; i < 4; i += 1) {
    const zoned = getZonedDateParts(new Date(guessMs), timeZone);
    const observedMs = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
      0
    );
    const delta = targetMs - observedMs;
    guessMs += delta;
    lastDelta = delta;
    if (delta === 0) {
      break;
    }
  }

  if (lastDelta !== 0) {
    throw new Error(
      `Unable to resolve zoned datetime without DST ambiguity for ${requestedWallTime} in ${timeZone}`
    );
  }

  return new Date(guessMs);
}

export function getStartOfTodayInTimeZoneUtc(timeZone: string, now: Date = new Date()): Date {
  const parts = getZonedDateParts(now, timeZone);
  return zonedDateTimeToUtcDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
}
