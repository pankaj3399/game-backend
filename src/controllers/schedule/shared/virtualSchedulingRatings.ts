import type { ScheduleParticipantInfo } from "./types";
import { finiteNumberOr } from "../../../shared/typeUtils";

export const DEFAULT_SCHEDULING_RATING = 1500;
const MIN_RATING_STEP = 8;

export function participantRealRating(participant: ScheduleParticipantInfo): number {
  return finiteNumberOr(participant.elo?.rating, DEFAULT_SCHEDULING_RATING);
}

/** 0 = strongest by real rating, higher = weaker. */
export function computeNaturalRatingRanks(
  participants: ScheduleParticipantInfo[]
): Map<string, number> {
  const sorted = [...participants].sort((left, right) => {
    const leftRating = participantRealRating(left);
    const rightRating = participantRealRating(right);
    if (leftRating !== rightRating) {
      return rightRating - leftRating;
    }

    return left._id.toString().localeCompare(right._id.toString());
  });

  const ranks = new Map<string, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    ranks.set(sorted[index]._id.toString(), index);
  }

  return ranks;
}

/**
 * Spacing between implied strength tiers, derived from the field's rating spread.
 */
export function computeRatingStep(participants: ScheduleParticipantInfo[]): number {
  const ratings = participants.map(participantRealRating).sort((left, right) => right - left);
  if (ratings.length < 2) {
    return 25;
  }

  const spread = ratings[0] - ratings[ratings.length - 1];
  return Math.max(MIN_RATING_STEP, Math.round(spread / (ratings.length - 1)));
}

/**
 * Virtual ratings for scheduling: each player's real rating adjusted by how far the
 * organiser moved them from their natural rating rank (not a reassigned rating pool).
 */
export function computeVirtualSchedulingRatings(
  participantsInListOrder: ScheduleParticipantInfo[]
): Map<string, number> {
  const naturalRanks = computeNaturalRatingRanks(participantsInListOrder);
  const step = computeRatingStep(participantsInListOrder);
  const virtualRatings = new Map<string, number>();

  for (let organizerRank = 0; organizerRank < participantsInListOrder.length; organizerRank += 1) {
    const participant = participantsInListOrder[organizerRank];
    const participantId = participant._id.toString();
    const naturalRank = naturalRanks.get(participantId) ?? organizerRank;
    const rankDelta = naturalRank - organizerRank;

    virtualRatings.set(participantId, participantRealRating(participant) + rankDelta * step);
  }

  return virtualRatings;
}

export function virtualRatingForParticipant(
  participantId: string,
  virtualRatings: Map<string, number>
): number {
  return virtualRatings.get(participantId) ?? DEFAULT_SCHEDULING_RATING;
}
