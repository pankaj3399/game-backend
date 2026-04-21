import {
  buildDoublesPairs,
  getParticipantOrder,
  participantDisplayName,
} from "../shared/helpers";
import type { TournamentScheduleContext } from "../shared/types";

export function generateDoublesPairsFlow(
  participantOrder: string[],
  tournament: TournamentScheduleContext
) {
  const orderedParticipants = getParticipantOrder(participantOrder, tournament.participants);
  const pairs = buildDoublesPairs(orderedParticipants);

  return {
    teams: pairs.teams.map((team) => ({
      team: team.team,
      players: team.players.map((player, index) => ({
        id: player._id.toString(),
        name: participantDisplayName(player, `Player ${index + 1}`),
        alias: player.alias,
        skillLabel: "glicko2",
        rating: player.elo?.rating ?? 1500,
      })),
    })),
    unpaired: pairs.unpaired.map((participant, index) => ({
      id: participant._id.toString(),
      name: participantDisplayName(participant, `Player ${index + 1}`),
      alias: participant.alias,
      skillLabel: "glicko2",
      rating: participant.elo?.rating ?? 1500,
    })),
  };
}
