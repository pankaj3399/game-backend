import {
  getDefaultScheduleInput,
  participantDisplayName,
  sortParticipantsForScheduling,
} from "../shared/helpers";
import type { TournamentScheduleContext, TournamentScheduleResponse } from "../shared/types";

export function mapScheduleViewResponse(
  tournament: TournamentScheduleContext,
  scheduleSummary: { currentRound: number; totalRounds: number },
  options?: { matchesPerPlayer?: number | null }
): TournamentScheduleResponse {
  const rankedParticipants = sortParticipantsForScheduling(tournament.participants);

  return {
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name,
    },
    scheduleInput: getDefaultScheduleInput(tournament, {
      matchesPerPlayer: options?.matchesPerPlayer ?? null,
    }),
    participants: rankedParticipants.map((participant, index) => ({
      id: participant._id.toString(),
      name: participantDisplayName(participant, `Player ${index + 1}`),
      alias: participant.alias,
      skillLabel: "glicko2",
      rating: participant.elo?.rating ?? 1500,
      order: index + 1,
    })),
    scheduleSummary,
  };
}
