import Tournament from "../../../models/Tournament";
import Game from "../../../models/Game";
import type { TournamentPopulated } from "../../../types/api/tournament";

export interface TournamentLeaveBlockers {
  hasPendingScoreMatches: boolean;
  hasUnfinishedMatches: boolean;
}

export type TournamentByIdWithLeaveBlockers = TournamentPopulated & {
  leaveBlockers?: TournamentLeaveBlockers;
};

function isSameParticipantId(id: unknown, authId: string) {
  if (id == null) {
    return false;
  }

  return String(id) === authId;
}

/**
 * Loads a tournament by ID with the standard populate graph for detail-style handlers
 * (club + courts, schedule summary, sponsor, participants).
 */
export async function fetchTournamentById(
  id: string,
  options?: { participantIdForLeaveChecks?: string }
): Promise<TournamentByIdWithLeaveBlockers | null> {
  const tournament = await Tournament.findById(id)
    .populate({
      path: "club",
      select: "name address",
      populate: {
        path: "courts",
        select: "name type placement",
      },
    })
    .populate({
      path: "schedule",
      select: "currentRound rounds.round",
    })
    .populate("sponsor", "name logoUrl link")
    .populate("participants", "name alias")
    .lean<TournamentPopulated>()
    .exec();

  if (!tournament) {
    return null;
  }

  const participantId = options?.participantIdForLeaveChecks?.trim();
  if (!participantId) {
    return tournament;
  }

  const isParticipant = (tournament.participants ?? []).some((participant) =>
    isSameParticipantId(participant?._id, participantId)
  );
  if (!isParticipant) {
    return tournament;
  }

  const [hasPendingScoreMatches, hasUnfinishedMatches] = await Promise.all([
    Game.exists({
      tournament: id,
      status: "pendingScore",
      $or: [{ "side1.players": participantId }, { "side2.players": participantId }],
    })
      .lean()
      .exec(),
    Game.exists({
      tournament: id,
      status: { $nin: ["finished", "cancelled", "pendingScore"] },
      $or: [{ "side1.players": participantId }, { "side2.players": participantId }],
    })
      .lean()
      .exec(),
  ]);

  return {
    ...tournament,
    leaveBlockers: {
      hasPendingScoreMatches: Boolean(hasPendingScoreMatches),
      hasUnfinishedMatches: Boolean(hasUnfinishedMatches),
    },
  };
}
