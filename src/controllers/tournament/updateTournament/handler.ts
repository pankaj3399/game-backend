import type { Types } from "mongoose";
import Tournament, { type ITournament } from "../../../models/Tournament";
import type { UpdateDraftInput } from "./validation";
import { computeEffectiveSponsor } from "./computeEffectiveSponsor";

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
  context: { clubChanged: boolean }
) {
  const payload: Record<string, unknown> = { ...data };

  if (context.clubChanged) {
    payload.sponsor = computeEffectiveSponsor(true, data.sponsor, undefined);
  }

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
function mapTournamentSummary(
  updated: Pick<ITournament, "name" | "club" | "status" | "date" | "updatedAt"> & {
    _id: Types.ObjectId;
  }
) {
  return {
    id: updated._id,
    name: updated.name,
    club: updated.club,
    status: updated.status,
    date: updated.date,
    updatedAt: updated.updatedAt,
  };
}