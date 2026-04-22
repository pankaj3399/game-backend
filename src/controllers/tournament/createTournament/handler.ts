import mongoose from "mongoose";
import Court from "../../../models/Court";
import Tournament from "../../../models/Tournament";
import type { CreateTournamentInput } from "./validation";
import { authorizeCreate, type AuthenticatedSession } from "./authorize";
import { logger } from "../../../lib/logger";
import { error, ok } from "../../../shared/helpers";
import {
  resolveTournamentTimezoneFromClub,
  TournamentTimezoneResolutionError,
} from "../shared/resolveTournamentTimezone";
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

  const mongoSession = await mongoose.startSession();
  try {
    const tournamentTimezone = await resolveTournamentTimezoneFromClub(auth.data.context.clubId);
    const payload = {
      ...data,
      timezone: tournamentTimezone,
      createdBy: session._id,
    };
    const flowResult = await mongoSession.withTransaction(async () => {
      if (data.status === "active") {
        const hasCourt = await Court.exists({ club: auth.data.context.clubId })
          .session(mongoSession)
          .exec();
        if (!hasCourt) {
          throw new Error(
            "Selected club has no courts. Add at least one court before publishing this tournament."
          );
        }
      }
      const [tournament] = await Tournament.create([payload], {
        session: mongoSession,
      });
      return ok(
        {
          tournament: {
            id: tournament._id,
            name: tournament.name,
            club: tournament.club,
            status: tournament.status,
            date: tournament.date,
            createdAt: tournament.createdAt,
          },
        },
        { status: 200, message: "Tournament created successfully" }
      );
    });
    if (!flowResult) {
      return error(500, "Tournament creation transaction was aborted");
    }
    return flowResult;
  } catch (err: unknown) {
    if (err instanceof TournamentTimezoneResolutionError) {
      return error(400, err.message);
    }
    if (err instanceof Error) {
      if (err.message.includes("Selected club has no courts")) {
        return error(400, err.message);
      }
    }
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
  } finally {
    await mongoSession.endSession();
  }
}
