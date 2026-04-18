import type { DbIdLike } from "../../../types/domain/common";
import type { TournamentMode } from "../../../types/domain/tournament";
import type { TournamentPlayMode } from "../../../types/domain/tournament";

export type ScheduleMode = "singles" | "doubles";

export type {
  ScheduleClubInfo,
  ScheduleCourtInfo,
  ScheduleParticipantElo,
  ScheduleParticipantInfo,
  TournamentScheduleContext,
} from "./scheduleContext.schema";

export type { GenerateScheduleBody, GeneratePairsBody } from "./validation";

/** Raw lean/populated tournament shape before Zod normalization (Mongo may omit or null fields). */
export interface TournamentScheduleContextRaw {
  _id?: DbIdLike | null;
  name?: string | null;
  minMember?: number | null;
  firstRoundScheduledAt?: Date | null;
  tournamentMode?: TournamentMode | null;
  date?: Date | null;
  startTime?: string | null;
  duration?: string | null;
  breakDuration?: string | null;
  matchesPerPlayer?: number | null;
  totalRounds?: number | null;
  playMode?: TournamentPlayMode | null;
  createdBy?: DbIdLike | null;
  club?: {
    _id?: DbIdLike | null;
    courts?: Array<{ _id?: DbIdLike | null; name?: string | null }> | null;
  } | null;
  participants?: Array<{
    _id?: DbIdLike | null;
    name?: string | null;
    alias?: string | null;
    elo?: { rating?: number | null } | null;
  }> | null;
  schedule?: DbIdLike | { _id?: DbIdLike } | null;
}

export interface ScheduleInputResponse {
  matchDurationMinutes?: number;
  breakTimeMinutes?: number;
  matchesPerPlayer: number;
  startTime: string;
  mode: ScheduleMode;
  availableCourts: Array<{
    id: string;
    name: string;
    selected: boolean;
  }>;
}

export interface ScheduleParticipantResponse {
  id: string;
  name: string;
  alias: string | null;
  skillLabel: string;
  rating: number;
  order: number;
}

export interface TournamentScheduleResponse {
  tournament: {
    id: string;
    name: string;
  };
  scheduleInput: ScheduleInputResponse;
  participants: ScheduleParticipantResponse[];
  scheduleSummary: {
    currentRound: number;
    totalRounds: number;
  };
}
