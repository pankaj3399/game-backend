import mongoose from "mongoose";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";
import Tournament from "../../../models/Tournament";
import Game from "../../../models/Game";

function isSameParticipantId(id: unknown, authId: mongoose.Types.ObjectId) {
  if (id instanceof mongoose.Types.ObjectId) {
    return id.equals(authId);
  }

  if (typeof id === "object" && id !== null && "_id" in id) {
    const nestedId = (id as { _id?: unknown })._id;
    if (nestedId instanceof mongoose.Types.ObjectId) {
      return nestedId.equals(authId);
    }
    if (nestedId != null) {
      return String(nestedId) === authId.toString();
    }
  }

  if (id == null) {
    return false;
  }

  return String(id) === authId.toString();
}

/**
 * Atomically removes the user from tournament participants.
 * Any unfinished matches for the leaving participant are auto-finished as WO
 * losses so the opponent side progresses without manual intervention.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  authSession: AuthenticatedSession
) {
  const mongoSession = await mongoose.startSession();
  type LeaveTransactionResult =
    | { outcome: "left"; tournament: { participants?: mongoose.Types.ObjectId[]; maxMember?: number } }
    | { outcome: "not_participant" }
    | null;
  let returnedDoc: LeaveTransactionResult = null;

  try {
    returnedDoc = await mongoSession.withTransaction(async () => {
      const fresh = await Tournament.findById(tournamentId)
        .select("_id participants maxMember")
        .session(mongoSession)
        .exec();
      if (!fresh) return null;

      const wasParticipant = (fresh.participants ?? []).some((id) =>
        isSameParticipantId(id, authSession._id)
      );
      if (!wasParticipant) {
        return { outcome: "not_participant" as const };
      }

      const updatedTournament = await Tournament.findOneAndUpdate(
        { _id: tournamentId, participants: authSession._id },
        { $pull: { participants: authSession._id } },
        { new: true, session: mongoSession }
      )
        .select("participants maxMember")
        .lean<{ participants?: mongoose.Types.ObjectId[]; maxMember?: number } | null>()
        .exec();
      if (!updatedTournament) {
        return null;
      }

      const unfinishedMatches = await Game.find({
        tournament: tournamentId,
        status: { $nin: ["finished", "cancelled"] },
        $or: [{ "side1.players": authSession._id }, { "side2.players": authSession._id }],
      })
        .select("_id side1.players side2.players")
        .session(mongoSession)
        .lean<
          Array<{
            _id: mongoose.Types.ObjectId;
            side1?: { players?: mongoose.Types.ObjectId[] };
            side2?: { players?: mongoose.Types.ObjectId[] };
          }>
        >()
        .exec();

      const now = new Date();
      for (const match of unfinishedMatches) {
        const leavesFromSide1 = (match.side1?.players ?? []).some((id) =>
          isSameParticipantId(id, authSession._id)
        );
        const score = leavesFromSide1
          ? { playerOneScores: ["wo" as const], playerTwoScores: [1] }
          : { playerOneScores: [1], playerTwoScores: ["wo" as const] };
        await Game.updateOne(
          { _id: match._id, status: { $nin: ["pendingScore"] } },
          {
            $set: {
              score,
              status: "finished" as const,
              endTime: now,
            },
          },
          { session: mongoSession }
        ).exec();
      }

      return { outcome: "left" as const, tournament: updatedTournament };
    });
  } finally {
    await mongoSession.endSession();
  }

  if (!returnedDoc) {
    return error(404, "Tournament not found");
  }

  if (returnedDoc.outcome === "not_participant") {
    return error(400, "Not a participant in this tournament");
  }

  const stillParticipant = (returnedDoc.tournament.participants ?? []).some((id) =>
    isSameParticipantId(id, authSession._id)
  );
  if (stillParticipant) {
    return error(409, "Unable to leave tournament due to a concurrent update. Please retry.");
  }

  const spotsFilled = (returnedDoc.tournament.participants ?? []).length;
  const spotsTotal = Math.max(1, returnedDoc.tournament.maxMember ?? 1);
  const isParticipant = false;

  return ok(
    {
      tournamentId,
      spotsFilled,
      spotsTotal,
      isParticipant,
    },
    { status: 200, message: "Successfully left tournament" }
  );
}
