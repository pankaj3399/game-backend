import Tournament from "../../../models/Tournament";
import type { UpdateDraftInput } from "./validation";
import type { UpdateContext } from "./authorize";

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
  data: UpdateDraftInput,
  context: UpdateContext
) {

  const payload = buildUpdatePayload(data, context);

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


function buildUpdatePayload(
  data: UpdateDraftInput,
  context: UpdateContext
) {
  const payload = { ...data };

  if (context.isChangingClub) {
    payload.sponsor = undefined;
    payload.courts = undefined;
  }

  return payload;
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