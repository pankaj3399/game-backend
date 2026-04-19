import type { GameStatus } from "../types/domain/game";

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

interface ResolveTimedGameStatusInput {
  persistedStatus: GameStatus;
  startTime: Date | null | undefined;
  matchDurationMinutes: number | null | undefined;
  now: Date;
}

export function resolveTimedGameStatus(input: ResolveTimedGameStatusInput) {
  if (
    input.persistedStatus === "cancelled" ||
    input.persistedStatus === "finished" ||
    input.persistedStatus === "pendingScore"
  ) {
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

  const nowTimestamp = input.now.getTime();

  if (nowTimestamp < startTimestamp) {
    return "draft";
  }

  const endTimestamp = startTimestamp + durationMinutes * 60_000;
  if (nowTimestamp >= endTimestamp) {
    return "pendingScore";
  }

  return "active";
}