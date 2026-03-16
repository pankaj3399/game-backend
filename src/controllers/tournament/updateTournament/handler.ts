import Tournament from "../../../models/Tournament";
import Court from "../../../models/Court";
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

  const payload = await buildUpdatePayload(data, context);

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


async function buildUpdatePayload(
  data: UpdateDraftInput,
  context: UpdateContext
) {
  const payload = { ...data };

  if (context.isChangingClub) {
    payload.sponsor = undefined;
    const clubCourts = await Court.find({ club: context.updateClubId })
      .select("_id")
      .lean()
      .exec();
    payload.courts = clubCourts.map((court) => court._id.toString());
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