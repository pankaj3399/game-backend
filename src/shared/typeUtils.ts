import { Types } from "mongoose";
import type { DbIdLike } from "../types/domain/common";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isDbIdLike(value: unknown): value is DbIdLike {
  return typeof value === "string" || value instanceof Types.ObjectId;
}

/** Resolves a Mongo ref field that may be populated (`{ _id }`) or a raw id. */
export function resolveDbIdRef(
  value: DbIdLike | { _id: DbIdLike } | null | undefined
): DbIdLike | null | undefined {
  if (value == null) {
    return value;
  }

  if (isPlainObject(value) && "_id" in value) {
    const id = value._id;
    return isDbIdLike(id) ? id : null;
  }

  return isDbIdLike(value) ? value : null;
}

export function finiteNumberOr(
  value: number | null | undefined,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
