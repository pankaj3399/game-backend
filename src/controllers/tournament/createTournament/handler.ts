import Tournament from "../../../models/Tournament";
import type { CreateTournamentInput } from "./validation";
import { authorizeCreate, type AuthenticatedSession } from "./authorize";
import { checkCourtsBelongToClub } from "../../shared/relations";
import { logger } from "../../../lib/logger";
import { error, ok } from "../../shared/helpers";
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

  if (data.status === "active" && data.tournamentMode === "singleDay") {
    const courtResult = await checkCourtsBelongToClub(data.club, data.courts);
    if (courtResult.status !== 200) {
      return error(courtResult.status, courtResult.message);
    }
  }


  try {
    const tournament = await Tournament.create(data);
    return ok({
      tournament: {
        name: tournament.name,
        club: tournament.club,
        status: tournament.status,
        date: tournament.date,
        createdAt: tournament.createdAt,
      },
    }, { status: 200, message: "Tournament created successfully" });
  } catch (err) {
    logger.error("Failed to create tournament", { err });
    return error(500, "Failed to create tournament");
  }
}
