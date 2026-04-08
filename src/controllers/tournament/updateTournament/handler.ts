import Tournament from "../../../models/Tournament";
import type { UpdateDraftInput } from "./validation";

export interface UpdateResult {
  ok: true;
  tournament: {
    id: unknown;
    name: string;
    club: unknown;
    status: string;
    date?: Date;
    updatedAt?: Date;
  };
}

/**
 * Applies the validated update payload to the tournament.
 */
export async function updateTournamentFlow(
  tournamentId: string,
  data: UpdateDraftInput
) {
  const payload = { ...data };

  const updated = await Tournament.findByIdAndUpdate(
    tournamentId,
    { $set: payload },
    { new: true, runValidators: true }
  )
    .lean()
    .exec();

  if (!updated) {
    return { ok: false };
  }

  return {
    ok: true,
    tournament: mapTournamentSummary(updated),
  };
}
function mapTournamentSummary(updated: any) {
  return {
    id: updated._id,
    name: updated.name,
    club: updated.club,
    status: updated.status,
    date: updated.date,
    updatedAt: updated.updatedAt,
  };
}