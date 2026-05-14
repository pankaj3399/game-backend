/** API-facing match status for tournament match / live-match responses. */
export type MatchStatusResponse =
  | "completed"
  | "inProgress"
  | "pendingScore"
  | "scheduled"
  | "cancelled";

export interface MatchPlayerRatingResponse {
  rating: number | null;
  rd: number | null;
}

export interface MatchPlayerResponse {
  id: string;
  name: string | null;
  alias: string | null;
  profilePictureUrl?: string | null;
  snapshotElo?: MatchPlayerRatingResponse | null;
  elo?: MatchPlayerRatingResponse | null;
}
