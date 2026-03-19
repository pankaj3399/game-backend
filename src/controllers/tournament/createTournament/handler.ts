import Tournament from "../../../models/Tournament";
import Court from "../../../models/Court";
import type { CreateTournamentInput } from "./validation";
import { authorizeCreate, type AuthenticatedSession } from "./authorize";
import { logger } from "../../../lib/logger";
import { error, ok } from "../../../shared/helpers";
/**
 * Orchestrates create-tournament: resolve courts (when applicable), authorize,
 * build payload, persist. Returns a result object for the HTTP layer.
 * Caller must ensure session is authenticated (e.g. index checks !session?._id).
 */
export async function createTournamentFlow(
  data: CreateTournamentInput,
  session: AuthenticatedSession
) {
  const auth = await authorizeCreate(data, session);
  if (auth.status !== 200) {
    return error(auth.status, auth.message);
  }

  const clubCourts = await Court.find({ club: data.club })
    .select("_id")
    .lean()
    .exec();

  if (data.status === "active" && clubCourts.length === 0) {
    return error(
      400,
      "Selected club has no courts. Add at least one court before publishing this tournament."
    );
  }

  const payload = {
    ...data,
    courts: clubCourts.map((court) => court._id.toString()),
  };

  try {
    const tournament = await Tournament.create(payload);
    return ok({
      tournament: {
        id: tournament._id,
        name: tournament.name,
        club: tournament.club,
        status: tournament.status,
        date: tournament.date,
        createdAt: tournament.createdAt,
      },
    }, { status: 200, message: "Tournament created successfully" });
  } catch (err: unknown) {
    const mongoErr = err as {
      code?: number;
      keyPattern?: Record<string, number>;
      keyValue?: Record<string, unknown>;
    };

    if (mongoErr?.code === 11000) {
      if (mongoErr.keyPattern?.club === 1 && mongoErr.keyPattern?.name === 1) {
        return error(409, "A tournament with this name already exists in the selected club");
      }
      if (mongoErr.keyPattern?.name === 1) {
        return error(409, "A tournament with this name already exists");
      }
      return error(409, "A tournament with the same unique data already exists");
    }

    logger.error("Failed to create tournament", { err });
    return error(500, "Failed to create tournament");
  }
}
