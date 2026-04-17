import type { GameStatus } from "../types/domain/game";

const DEFAULT_MATCH_DURATION_MINUTES = 60;

function normalizeDurationMinutes(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return null;
  }

  return normalized;
}

export function parseDurationMinutes(
  durationText: string | null | undefined,
  fallback: number = DEFAULT_MATCH_DURATION_MINUTES
): number {
  const fallbackMinutes = normalizeDurationMinutes(fallback) ?? DEFAULT_MATCH_DURATION_MINUTES;
  if (!durationText) {
    return fallbackMinutes;
  }

  const match = durationText.match(/(\d+)/);
  if (!match) {
    return fallbackMinutes;
  }

  const parsed = Number.parseInt(match[1], 10);
  return normalizeDurationMinutes(parsed) ?? fallbackMinutes;
}

interface ResolveTimedGameStatusInput {
  persistedStatus: GameStatus;
  startTime: Date | null | undefined;
  matchDurationMinutes: number | null | undefined;
  now?: Date;
}

export function resolveTimedGameStatus(input: ResolveTimedGameStatusInput): GameStatus {
  if (input.persistedStatus === "cancelled" || input.persistedStatus === "finished") {
    return input.persistedStatus;
  }

  if (!(input.startTime instanceof Date)) {
    return input.persistedStatus;
  }

  const durationMinutes = normalizeDurationMinutes(input.matchDurationMinutes);
  if (durationMinutes == null) {
    return input.persistedStatus;
  }

  const startTimestamp = input.startTime.getTime();
  if (!Number.isFinite(startTimestamp)) {
    return input.persistedStatus;
  }

  const currentTime = input.now ?? new Date();
  const nowTimestamp = currentTime.getTime();

  if (nowTimestamp < startTimestamp) {
    return "draft";
  }

  const endTimestamp = startTimestamp + durationMinutes * 60_000;
  if (nowTimestamp >= endTimestamp) {
    return "finished";
  }

  return "active";
}