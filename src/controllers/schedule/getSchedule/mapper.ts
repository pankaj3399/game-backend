import { getDefaultScheduleInput, participantDisplayName } from "../shared/helpers";
import type { TournamentScheduleContext, TournamentScheduleResponse } from "../shared/types";

export function mapScheduleViewResponse(
  tournament: TournamentScheduleContext,
  scheduleSummary: { currentRound: number; totalRounds: number }
): TournamentScheduleResponse {
  return {
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name,
    },
    scheduleInput: getDefaultScheduleInput(tournament),
    participants: tournament.participants.map((participant, index) => ({
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
