import type { UpdateDraftInput } from "./validation";
import type { TournamentForUpdateAuth } from "../../../types/api";
import { error, ok } from "../../../shared/helpers";

function datesEqual(
  a: Date | null | undefined,
  b: Date | null | undefined
) {
  const ta = a != null ? new Date(a).getTime() : null;
  const tb = b != null ? new Date(b).getTime() : null;
  return ta === tb;
}

function nullableStringEqual(
  a: string | null | undefined,
  b: string | null | undefined
) {
  return (a ?? null) === (b ?? null);
}

/**
 * When a tournament is active and has enrolled participants, blocks schedule
 * changes and ensures capacity stays consistent with enrollment.
 */
export function validateActiveTournamentEnrolledUpdate(
  tournament: TournamentForUpdateAuth,
  data: UpdateDraftInput
) {
  if (tournament.status !== "active") {
    return ok(undefined, { status: 200, message: "OK" });
  }

  const enrolledCount = (tournament.participants ?? []).length;
  if (enrolledCount === 0) {
    return ok(undefined, { status: 200, message: "OK" });
  }

  if (data.date !== undefined && !datesEqual(tournament.date, data.date)) {
    return error(
      400,
      "Cannot change tournament date while the tournament is active with enrolled participants"
    );
  }

  if (
    data.startTime !== undefined &&
    !nullableStringEqual(tournament.startTime, data.startTime)
  ) {
    return error(
      400,
      "Cannot change start time while the tournament is active with enrolled participants"
    );
  }

  if (
    data.endTime !== undefined &&
    !nullableStringEqual(tournament.endTime, data.endTime)
  ) {
    return error(
      400,
      "Cannot change end time while the tournament is active with enrolled participants"
    );
  }

  const effectiveMin = data.minMember ?? tournament.minMember;
  const effectiveMax = data.maxMember ?? tournament.maxMember;

  if (effectiveMax != null && effectiveMax < enrolledCount) {
    return error(
      400,
      `maxMember must be at least ${enrolledCount} (current enrollment) while participants are registered`
    );
  }

  if (effectiveMin != null && effectiveMin > enrolledCount) {
    return error(
      400,
      `minMember cannot exceed ${enrolledCount} (current enrollment) while participants are registered`
    );
  }

  return ok(undefined, { status: 200, message: "OK" });
}
