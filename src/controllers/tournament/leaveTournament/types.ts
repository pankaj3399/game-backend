import type { Types } from "mongoose";
import type { TournamentPopulated } from "../../../types/api/tournament";

/** Tournament shape loaded for leave validation (initial load and conflict re-check). */
export type LeaveTournamentTournamentDoc = TournamentPopulated;

/** Lean document returned after a successful atomic participant pull. */
export interface LeaveTournamentPullLean {
  participants?: Types.ObjectId[];
  maxMember?: number;
}
